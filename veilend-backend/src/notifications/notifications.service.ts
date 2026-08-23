import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationKind, NotificationSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageDto } from '../common/dto/page.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { UserNotificationDto } from './dto/user-notification.dto';
import { ExpoPushService, PushMessage } from './expo-push.service';

const LIQUIDATION_KINDS = new Set<NotificationKind>([
  NotificationKind.LIQUIDATION_RISK,
  NotificationKind.LIQUIDATION_OPPORTUNITY,
]);

// Kinds whose real title/body may reveal private monetary details and must
// never leave the backend unencrypted.
const SENSITIVE_KINDS = LIQUIDATION_KINDS;

const CHANNEL_BY_KIND: Record<
  NotificationKind,
  keyof Pick<
    NotificationSettings,
    | 'liquidationRisk'
    | 'liquidationOpportunity'
    | 'generalAnnouncements'
    | 'marketing'
    | 'security'
  >
> = {
  LIQUIDATION_RISK: 'liquidationRisk',
  LIQUIDATION_OPPORTUNITY: 'liquidationOpportunity',
  ONBOARDING: 'security',
  IDLE_LOCK: 'security',
  SECURITY_ALERT: 'security',
  GENERAL_ANNOUNCEMENT: 'generalAnnouncements',
  MARKETING: 'marketing',
};

const LIQUIDATION_PUSH_COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async getNotifications(
    userId: string,
    query: GetNotificationsQueryDto,
  ): Promise<PageDto<UserNotificationDto>> {
    return this.prisma.withRepeatableRead(async (db) => {
      const where = { userId };

      const [records, itemCount] = await Promise.all([
        db.userNotification.findMany({
          where,
          take: query.take,
          skip: query.skip,
          orderBy: {
            createdAt: query.order.toLowerCase() as 'asc' | 'desc',
          },
        }),
        db.userNotification.count({ where }),
      ]);

      const data: UserNotificationDto[] = records.map((n) => ({
        id: n.id,
        kind: n.kind,
        payload: n.payload,
        readAt: n.readAt,
        pushDeliveredAt: n.pushDeliveredAt,
        createdAt: n.createdAt,
      }));

      const pageMetaDto = new PageMetaDto({ pageOptionsDto: query, itemCount });
      return new PageDto(data, pageMetaDto);
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const notification = await this.prisma.userNotification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      await this.prisma.userNotification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
  }

  /**
   * Integration point for the position-risk scanner: it computes health
   * factor itself and calls this once it decides a user is at risk. This
   * service does not poll or compute health factor on its own. Extra risk
   * context is optional so other callers keep working unchanged.
   */
  async notifyLiquidationRisk(
    userId: string,
    params: {
      healthFactor: number;
      shortfallUsd: number;
      band?: string;
      debtAssetCode?: string | null;
      debtValueUsd?: number;
      collateralValueUsd?: number;
    },
  ): Promise<void> {
    await this.notifyUser(userId, NotificationKind.LIQUIDATION_RISK, {
      title: 'Liquidation risk alert',
      body: `Your position's health factor is ${params.healthFactor.toFixed(2)} — a shortfall of $${params.shortfallUsd.toFixed(2)} could trigger liquidation.`,
      data: {
        healthFactor: params.healthFactor,
        shortfallUsd: params.shortfallUsd,
        ...(params.band ? { band: params.band } : {}),
        ...(params.debtAssetCode
          ? { debtAssetCode: params.debtAssetCode }
          : {}),
        ...(params.debtValueUsd !== undefined
          ? { debtValueUsd: params.debtValueUsd }
          : {}),
        ...(params.collateralValueUsd !== undefined
          ? { collateralValueUsd: params.collateralValueUsd }
          : {}),
      },
    });
  }

  /**
   * Writes the in-app notification row unconditionally, then decides
   * whether to also send a push: settings channel must be enabled, the
   * liquidation cooldown (if applicable) must have elapsed, the user must
   * have at least one device token, and — for sensitive kinds — an E2EE
   * public key must be on file (otherwise the push is skipped entirely
   * rather than ever sending real title/body in the clear).
   */
  async notifyUser(
    userId: string,
    kind: NotificationKind,
    payload: PushMessage,
  ): Promise<void> {
    const settings = await this.getOrCreateSettings(userId);

    const payloadJson: Prisma.InputJsonObject = {
      title: payload.title,
      body: payload.body,
      ...(payload.data ? { data: payload.data as Prisma.InputJsonValue } : {}),
    };

    const notification = await this.prisma.userNotification.create({
      data: { userId, kind, payload: payloadJson },
    });

    if (!settings[CHANNEL_BY_KIND[kind]]) {
      this.logger.log(
        `Notification channel disabled for user ${userId} (kind=${kind}); skipping push`,
      );
      return;
    }

    if (LIQUIDATION_KINDS.has(kind) && settings.lastLiquidationPushAt) {
      const elapsedMs = Date.now() - settings.lastLiquidationPushAt.getTime();
      if (elapsedMs < LIQUIDATION_PUSH_COOLDOWN_MS) {
        this.logger.log(
          `Liquidation push rate-limited for user ${userId} (last sent ${Math.round(elapsedMs / 1000)}s ago)`,
        );
        return;
      }
    }

    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (tokens.length === 0) {
      this.logger.log(
        `No push tokens registered for user ${userId}; skipping push`,
      );
      return;
    }

    const expoMessage = await this.buildExpoMessage(userId, kind, payload);
    if (!expoMessage) {
      return;
    }

    const { tickets, staleTokens } = await this.expoPush.send(
      tokens.map((t) => t.token),
      expoMessage,
    );

    if (staleTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: staleTokens } },
      });
      staleTokens.forEach((token) =>
        this.logger.log(`Stale token purged: ${token}`),
      );
    }

    const delivered = tickets.some((t) => t.status === 'ok');
    this.logger.log(
      `Push attempt for user ${userId} (kind=${kind}): ${tickets.length} ticket(s), delivered=${delivered}, staleTokensPurged=${staleTokens.length}`,
    );

    if (delivered) {
      await this.prisma.userNotification.update({
        where: { id: notification.id },
        data: { pushDeliveredAt: new Date() },
      });

      if (LIQUIDATION_KINDS.has(kind)) {
        await this.prisma.notificationSettings.update({
          where: { userId },
          data: { lastLiquidationPushAt: new Date() },
        });
      }
    }
  }

  /**
   * For sensitive kinds, returns an E2EE-wrapped Expo message whose title/
   * body are generic and whose real content only appears as ciphertext in
   * `data`. Returns null (skip push) if a sensitive kind has no E2EE key on
   * file — this is a deliberate fail-closed fallback, never a plaintext one.
   */
  private async buildExpoMessage(
    userId: string,
    kind: NotificationKind,
    payload: PushMessage,
  ): Promise<PushMessage | null> {
    if (!SENSITIVE_KINDS.has(kind)) {
      return payload;
    }

    const e2eeKey = await this.prisma.userE2eePublicKey.findUnique({
      where: { userId },
    });

    if (!e2eeKey) {
      this.logger.log(
        `No E2EE key on file for user ${userId}; skipping push for sensitive kind=${kind}`,
      );
      return null;
    }

    const encrypted = this.expoPush.encryptForUser(e2eeKey.publicKey, {
      title: payload.title,
      body: payload.body,
      data: payload.data,
    });

    return {
      title: 'Veilend Alert',
      body: 'Tap to view details in the app.',
      data: { e2ee: true, kind, ...encrypted },
    };
  }

  private async getOrCreateSettings(
    userId: string,
  ): Promise<NotificationSettings> {
    return this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
}

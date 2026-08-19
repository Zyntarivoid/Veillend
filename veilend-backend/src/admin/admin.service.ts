import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigureAssetDto } from './dto/configure-asset.dto';
import { SetOraclePriceDto } from './dto/set-oracle-price.dto';
import { SetMinCollateralRatioDto } from './dto/set-min-collateral-ratio.dto';
import { AddAdminDto } from './dto/add-admin.dto';
import { AdminActionStatus, AdminActionType, Prisma } from '@prisma/client';
import { PageOptionsDto } from '../common/dto/page-options.dto';
import { PageDto } from '../common/dto/page.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { AdminActionRepository } from './admin-action.repository';
import { AdminTransactionBuilderService } from './admin-transaction-builder.service';

export interface AdminActionDispatchResult {
  actionId: string;
  xdr?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private readonly adminActionRepository: AdminActionRepository,
    private readonly transactionBuilder: AdminTransactionBuilderService,
  ) {}

  /**
   * Add a new admin and log the action.
   * Runs under Serializable isolation to prevent concurrent additions of the
   * same wallet address racing past each other.
   */
  async addAdmin(dto: AddAdminDto, actorWallet: string) {
    return await this.prisma.withSerializable(async (tx) => {
      const admin = await tx.admin.create({
        data: {
          walletAddress: dto.walletAddress,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorWallet,
          action: AdminActionType.ADD_ADMIN,
          target: dto.walletAddress,
          payload: { walletAddress: dto.walletAddress },
        },
      });

      return admin;
    });
  }

  /**
   * Remove an admin and revoke all their sessions in a transaction.
   * Runs under Serializable isolation so session deletion and admin removal
   * are fully atomic and consistent.
   */
  async removeAdmin(walletAddress: string, actorWallet: string) {
    return await this.prisma.withSerializable(async (tx) => {
      // Find the user associated with this wallet address
      const user = await tx.user.findUnique({
        where: { walletAddress },
      });

      // Delete all sessions for this user (if they exist)
      if (user) {
        await tx.session.deleteMany({
          where: { userId: user.id },
        });
      }

      // Delete the admin record
      const admin = await tx.admin.delete({
        where: { walletAddress },
      });

      // Log the action
      await tx.adminAuditLog.create({
        data: {
          actorWallet,
          action: AdminActionType.REMOVE_ADMIN,
          target: walletAddress,
          payload: {
            removedAdmin: walletAddress,
            sessionsRevoked: user !== null,
          },
        },
      });

      return admin;
    });
  }

  async listAdmins() {
    return await this.prisma.admin.findMany();
  }

  /**
   * Configure asset support on-chain. Records the intent, builds an unsigned
   * Soroban transaction XDR for `propose_configure_asset`, and hands it to
   * the client to sign with Freighter. The backend never holds the admin
   * secret key.
   */
  async configureAsset(
    dto: ConfigureAssetDto,
    actorWallet: string,
  ): Promise<AdminActionDispatchResult> {
    return this.dispatchAction(actorWallet, AdminActionType.CONFIGURE_ASSET, {
      assetContractId: dto.assetContractId,
      supported: dto.supported,
    });
  }

  /**
   * Set an asset's oracle price on-chain. Records the intent and builds an
   * unsigned Soroban transaction XDR for `set_oracle_price`.
   */
  async setOraclePrice(
    dto: SetOraclePriceDto,
    actorWallet: string,
  ): Promise<AdminActionDispatchResult> {
    return this.dispatchAction(actorWallet, AdminActionType.SET_ORACLE_PRICE, {
      assetContractId: dto.assetContractId,
      price: dto.price,
    });
  }

  /**
   * Set the protocol minimum collateral ratio on-chain. Records the intent
   * and builds an unsigned Soroban transaction XDR for
   * `propose_set_min_collateral_ratio`.
   */
  async setMinCollateralRatio(
    dto: SetMinCollateralRatioDto,
    actorWallet: string,
  ): Promise<AdminActionDispatchResult> {
    return this.dispatchAction(
      actorWallet,
      AdminActionType.SET_MIN_COLLATERAL_RATIO,
      {
        minCollateralRatioBps: dto.minCollateralRatioBps,
      },
    );
  }

  /**
   * Common dispatch path for privileged Soroban mutations: (1) persist the
   * intent as PENDING so every request is audited, (2) build the unsigned
   * XDR (deterministic from the account nonce + action id), (3) return the
   * handoff payload. If the XDR cannot be built (e.g. contract not configured
   * or admin account not funded), the intent is recorded as FAILED and the
   * error is rethrown so the caller sees it.
   */
  private async dispatchAction(
    adminAddress: string,
    action: AdminActionType,
    payload: Record<string, Prisma.InputJsonValue>,
  ): Promise<AdminActionDispatchResult> {
    const record = await this.adminActionRepository.create({
      adminAddress,
      action,
      payload,
    });

    try {
      const xdr = await this.transactionBuilder.buildActionXdr(
        record.id,
        adminAddress,
        action,
        payload,
      );
      await this.adminActionRepository.updateXdr(record.id, xdr);
      return { actionId: record.id, xdr };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to build XDR for admin action ${record.id} (${action}): ${message}`,
      );
      await this.adminActionRepository.markFailed(record.id, message);
      throw error;
    }
  }

  /**
   * Record that the client signed and submitted the transaction for an
   * intent, transitioning PENDING → SENT. The watcher then resolves the
   * status from the on-chain outcome of `txHash`.
   */
  async submitTransaction(
    actionId: string,
    txHash: string,
    actorWallet: string,
  ) {
    const record = await this.adminActionRepository.findById(actionId);
    if (!record) {
      throw new NotFoundException('Admin action not found');
    }
    if (record.adminAddress !== actorWallet) {
      throw new ForbiddenException(
        'Admin action does not belong to the requesting admin',
      );
    }
    if (record.status !== AdminActionStatus.PENDING) {
      throw new ConflictException(
        `Admin action is not pending (current status: ${record.status})`,
      );
    }
    return this.adminActionRepository.markSent(actionId, txHash);
  }

  /**
   * Fetch a single admin action (intent + status) by id.
   */
  async getAction(actionId: string) {
    const record = await this.adminActionRepository.findById(actionId);
    if (!record) {
      throw new NotFoundException('Admin action not found');
    }
    return record;
  }

  /**
   * Get paginated audit log.
   * Uses RepeatableRead so the count and the page rows see the same snapshot.
   */
  async getAuditLog(pageOptionsDto: PageOptionsDto) {
    return this.prisma.withRepeatableRead(async (db) => {
      const [logs, itemCount] = await Promise.all([
        db.adminAuditLog.findMany({
          take: pageOptionsDto.take,
          skip: pageOptionsDto.skip,
          orderBy: {
            createdAt: pageOptionsDto.order.toLowerCase() as 'asc' | 'desc',
          },
        }),
        db.adminAuditLog.count(),
      ]);

      const pageMetaDto = new PageMetaDto({ pageOptionsDto, itemCount });

      return new PageDto(logs, pageMetaDto);
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRiskState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const RISK_SCAN_STATE_ID = 'global';

/** A debtor position row joined with its asset. */
export interface DebtorPositionRow {
  userId: string;
  assetId: string;
  depositedRaw: bigint;
  borrowedRaw: bigint;
  accruedInterestRaw: bigint;
  asset: {
    id: string;
    code: string;
    decimals: number;
    minCollateralRatio: number | null;
  };
}

/** Full per-user portfolio used for health-factor computation. */
export interface UserPortfolio {
  user: { id: string; walletAddress: string };
  positions: DebtorPositionRow[];
}

export interface QueuePageParams {
  limit: number;
  cursor?: { estSeizableUsd: number; userId: string };
  minHealthFactor?: number;
  assetCode?: string;
  minSeizableValue?: number;
}

const POSITION_ASSET_SELECT = {
  id: true,
  code: true,
  decimals: true,
  minCollateralRatio: true,
} as const;

@Injectable()
export class RiskRepository {
  private readonly logger = new Logger(RiskRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims the scan lease for this runner (singleton row). Returns false when
   * another replica holds an unexpired lease — guarantees at most one active
   * scanner across the fleet.
   */
  async claimScanLease(runnerId: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    // The singleton row must exist before the conditional claim UPDATE,
    // otherwise every contender would see zero matching rows on a fresh DB.
    await this.ensureStateRow();
    const result = await this.prisma.riskScanState.updateMany({
      where: {
        id: RISK_SCAN_STATE_ID,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseOwner: runnerId,
        leaseUntil: new Date(now.getTime() + ttlMs),
        lastScanStartedAt: now,
      },
    });
    return result.count === 1;
  }

  /** Creates the singleton state row once; safe under concurrent callers. */
  private async ensureStateRow(): Promise<void> {
    try {
      await this.prisma.riskScanState.upsert({
        where: { id: RISK_SCAN_STATE_ID },
        create: { id: RISK_SCAN_STATE_ID },
        update: {},
      });
    } catch {
      // Lost an insert race — the row exists now either way.
    }
  }

  /** Extends our own lease mid-scan (long passes outliving the TTL). */
  async refreshScanLease(runnerId: string, ttlMs: number): Promise<void> {
    await this.prisma.riskScanState.updateMany({
      where: { id: RISK_SCAN_STATE_ID, leaseOwner: runnerId },
      data: { leaseUntil: new Date(Date.now() + ttlMs) },
    });
  }

  /** Releases the lease and records scan outcome metrics. */
  async finishScan(
    runnerId: string,
    outcome: {
      usersEvaluated: number;
      positionsEvaluated: number;
      notificationsSent: number;
      unpricedCount: number;
      durationMs: number;
      error?: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.riskScanState.updateMany({
        where: { id: RISK_SCAN_STATE_ID, leaseOwner: runnerId },
        data: {
          leaseOwner: null,
          leaseUntil: null,
          ...(outcome.error ? undefined : { lastScanAt: new Date() }),
          lastDurationMs: Math.max(0, Math.round(outcome.durationMs)),
          usersEvaluated: outcome.usersEvaluated,
          positionsEvaluated: outcome.positionsEvaluated,
          notificationsSent: outcome.notificationsSent,
          unpricedCount: outcome.unpricedCount,
          lastError: outcome.error ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record risk-scan completion: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Read-only snapshot of scanner state (for health/status endpoints). */
  async getScanState(): Promise<{
    lastScanAt: Date | null;
    lastScanStartedAt: Date | null;
    leaseOwner: string | null;
    leaseUntil: Date | null;
    usersEvaluated: number;
    lastError: string | null;
  }> {
    // Singleton row may not exist yet — create lazily on first read.
    const state = await this.prisma.riskScanState.upsert({
      where: { id: RISK_SCAN_STATE_ID },
      create: { id: RISK_SCAN_STATE_ID },
      update: {},
    });
    return {
      lastScanAt: state.lastScanAt,
      lastScanStartedAt: state.lastScanStartedAt,
      leaseOwner: state.leaseOwner,
      leaseUntil: state.leaseUntil,
      usersEvaluated: state.usersEvaluated,
      lastError: state.lastError,
    };
  }

  /**
   * Loads one chunk of positions that carry debt (borrowedRaw > 0), ordered
   * by userId for stable keyset pagination.
   */
  async loadDebtorPositionChunk(
    afterUserId: string | undefined,
    batchSize: number,
  ): Promise<{ rows: DebtorPositionRow[]; nextCursor: string | null }> {
    const rows = await this.prisma.position.findMany({
      where: {
        borrowedRaw: { gt: 0n },
        ...(afterUserId ? { userId: { gt: afterUserId } } : {}),
      },
      include: { asset: { select: POSITION_ASSET_SELECT } },
      orderBy: { userId: 'asc' },
      take: batchSize,
    });

    const mapped = rows.map((row) => ({
      userId: row.userId,
      assetId: row.assetId,
      depositedRaw: row.depositedRaw,
      borrowedRaw: row.borrowedRaw,
      accruedInterestRaw: row.accruedInterestRaw,
      asset: {
        id: row.asset.id,
        code: row.asset.code,
        decimals: row.asset.decimals,
        minCollateralRatio: row.asset.minCollateralRatio,
      },
    }));

    const nextCursor =
      mapped.length === batchSize ? mapped[mapped.length - 1].userId : null;

    return { rows: mapped, nextCursor };
  }

  /** Loads a user's full portfolio (all assets, not just debt-bearing ones). */
  async loadUserPortfolioByUserId(
    userId: string,
  ): Promise<UserPortfolio | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, walletAddress: true },
    });
    if (!user) return null;
    return this.loadPortfolioRows(user);
  }

  /** Same, resolved by wallet address (for the authenticated live view). */
  async loadUserPortfolioByWallet(
    walletAddress: string,
  ): Promise<UserPortfolio | null> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true, walletAddress: true },
    });
    if (!user) return null;
    return this.loadPortfolioRows(user);
  }

  private async loadPortfolioRows(user: {
    id: string;
    walletAddress: string;
  }): Promise<UserPortfolio> {
    const positions = await this.prisma.position.findMany({
      where: { userId: user.id },
      include: { asset: { select: POSITION_ASSET_SELECT } },
      orderBy: { assetId: 'asc' },
    });

    return {
      user,
      positions: positions.map((row) => ({
        userId: row.userId,
        assetId: row.assetId,
        depositedRaw: row.depositedRaw,
        borrowedRaw: row.borrowedRaw,
        accruedInterestRaw: row.accruedInterestRaw,
        asset: {
          id: row.asset.id,
          code: row.asset.code,
          decimals: row.asset.decimals,
          minCollateralRatio: row.asset.minCollateralRatio,
        },
      })),
    };
  }

  async getUserRiskState(userId: string): Promise<UserRiskState | null> {
    return this.prisma.userRiskState.findUnique({ where: { userId } });
  }

  /** Persists the scanner's read-model snapshot for one user. */
  async upsertUserRiskState(
    userId: string,
    data: {
      band: string;
      riskStatus: string;
      healthFactor: number | null;
      debtValueUsd: number;
      collateralValueUsd: number;
      maxRepayableUsd: number;
      estSeizableUsd: number;
      distanceToLiquidation: number | null;
      priceMoveToLiquidation: number | null;
      primaryDebtAssetId: string | null;
      lastEvaluatedBand: string;
      lastNotifiedBand: string | null;
      lastEvaluatedAt: Date;
    },
  ): Promise<UserRiskState> {
    return this.prisma.userRiskState.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /**
   * Keyset-paginated liquidation queue over persisted UserRiskState rows:
   * band='liquidatable', ordered by estSeizableUsd DESC then userId ASC.
   * Debt asset codes are resolved in a single batched lookup per page.
   */
  async getLiquidationQueuePage(params: QueuePageParams): Promise<{
    items: Array<{
      userId: string;
      walletAddress: string;
      band: string;
      healthFactor: number;
      estSeizableUsd: number;
      debtValueUsd: number;
      collateralValueUsd: number;
      maxRepayableUsd: number;
      distanceToLiquidation: number | null;
      priceMoveToLiquidation: number | null;
      primaryDebtAssetCode: string | null;
      updatedAt: Date;
    }>;
    nextCursor: string | null;
  }> {
    const where: Prisma.UserRiskStateWhereInput = {
      band: 'liquidatable',
      riskStatus: 'priced',
      ...(params.minHealthFactor != null
        ? { healthFactor: { gte: params.minHealthFactor } }
        : {}),
      ...(params.minSeizableValue != null
        ? { estSeizableUsd: { gte: params.minSeizableValue } }
        : {}),
      ...(params.assetCode
        ? {
            user: {
              is: {
                positions: {
                  some: {
                    borrowedRaw: { gt: 0n },
                    asset: { is: { code: params.assetCode } },
                  },
                },
              },
            },
          }
        : {}),
      ...(params.cursor
        ? {
            OR: [
              { estSeizableUsd: { lt: params.cursor.estSeizableUsd } },
              {
                estSeizableUsd: params.cursor.estSeizableUsd,
                userId: { gt: params.cursor.userId },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.userRiskState.findMany({
      where,
      include: { user: { select: { walletAddress: true } } },
      orderBy: [{ estSeizableUsd: 'desc' }, { userId: 'asc' }],
      take: params.limit + 1,
    });

    let nextCursor: string | null = null;
    let page = rows;
    if (rows.length > params.limit) {
      page = rows.slice(0, params.limit);
      const last = page[page.length - 1];
      nextCursor = encodeQueueCursor({
        estSeizableUsd: last.estSeizableUsd,
        userId: last.userId,
      });
    }

    // Resolve primary debt asset codes in one batched query.
    const debtAssetIds = Array.from(
      new Set(
        page.map((r) => r.primaryDebtAssetId).filter((v): v is string => !!v),
      ),
    );
    const codeById = new Map<string, string>();
    if (debtAssetIds.length > 0) {
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: debtAssetIds } },
        select: { id: true, code: true },
      });
      for (const a of assets) codeById.set(a.id, a.code);
    }

    return {
      items: page.map((row) => ({
        userId: row.userId,
        walletAddress: row.user.walletAddress,
        band: row.band,
        healthFactor: row.healthFactor ?? 0,
        estSeizableUsd: row.estSeizableUsd,
        debtValueUsd: row.debtValueUsd,
        collateralValueUsd: row.collateralValueUsd,
        maxRepayableUsd: row.maxRepayableUsd,
        distanceToLiquidation: row.distanceToLiquidation,
        priceMoveToLiquidation: row.priceMoveToLiquidation,
        primaryDebtAssetCode: row.primaryDebtAssetId
          ? (codeById.get(row.primaryDebtAssetId) ?? null)
          : null,
        updatedAt: row.updatedAt,
      })),
      nextCursor,
    };
  }
}

export interface QueueCursor {
  estSeizableUsd: number;
  userId: string;
}

export function encodeQueueCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeQueueCursor(raw: string): QueueCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'estSeizableUsd' in parsed &&
      typeof (parsed as Record<string, unknown>).estSeizableUsd === 'number' &&
      'userId' in parsed &&
      typeof (parsed as Record<string, unknown>).userId === 'string'
    ) {
      return parsed as QueueCursor;
    }
  } catch {
    // invalid cursor → treated as absent by caller
  }
  return null;
}

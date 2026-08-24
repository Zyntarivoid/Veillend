import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProtocolService } from '../protocol/protocol.service';
import {
  computeHealthFactor,
  PositionLike,
  OraclePriceEntry,
} from '../common/utils/health-factor.util';
import { formatRawAmount } from '../common/utils/format-raw-amount';

export enum SolvencyErrorKind {
  INSUFFICIENT_DEPOSIT = 'INSUFFICIENT_DEPOSIT',
  INSUFFICIENT_COLLATERAL = 'INSUFFICIENT_COLLATERAL',
  ORACLE_UNAVAILABLE = 'ORACLE_UNAVAILABLE',
}

export interface SolvencyCheckResult {
  /** Whether the withdrawal is allowed */
  allowed: boolean;
  /** The projected post-withdrawal health factor (null if oracle data is stale/missing) */
  projectedHealthFactor: number | null;
  /** The current pre-withdrawal health factor */
  currentHealthFactor: number | null;
  /** Error kind if disallowed */
  errorKind?: SolvencyErrorKind;
  /** Human-readable error detail */
  detail?: string;
  /** Oracle prices that are stale or missing */
  stalePrices?: string[];
  missingPrices?: string[];
}

const MAX_ORACLE_AGE_MS = 300_000; // 5 minutes
const MIN_HEALTH_FACTOR = 1.0;

/**
 * Rounds a number conservatively toward zero (floor for positive, ceil for negative).
 * Ensures a rounding difference never lets a withdrawal through that the
 * contract would reject.
 */
function conservativeRound(value: number): number {
  if (value >= 0) {
    return Math.floor(value * 1e8) / 1e8;
  }
  return Math.ceil(value * 1e8) / 1e8;
}

@Injectable()
export class WithdrawalSolvencyService {
  private readonly logger = new Logger(WithdrawalSolvencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolService: ProtocolService,
  ) {}

  /**
   * Full cross-asset solvency check for a withdrawal request.
   *
   * Loads ALL of the user's positions, fetches oracle prices from the
   * Position table (depositedUsd/borrowedUsd cached by indexer), and
   * computes the projected post-withdrawal health factor.
   *
   * @param userId         The user requesting the withdrawal
   * @param assetId        The asset being withdrawn (must exist)
   * @param amountStroops  The raw amount to withdraw
   * @returns SolvencyCheckResult with projected health factor and error info
   */
  async assertWithdrawable(
    userId: string,
    assetId: string,
    amountStroops: number,
  ): Promise<SolvencyCheckResult> {
    const now = Date.now();

    const positions = await this.prisma.position.findMany({
      where: { userId },
      include: { asset: true },
    });

    if (positions.length === 0) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: null,
        errorKind: SolvencyErrorKind.INSUFFICIENT_DEPOSIT,
        detail: 'No positions found for user',
      };
    }

    const targetPosition = positions.find((p) => p.assetId === assetId);
    if (!targetPosition) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: null,
        errorKind: SolvencyErrorKind.INSUFFICIENT_DEPOSIT,
        detail: `No position found for asset ${assetId}`,
      };
    }

    const assetDecimals = targetPosition.asset.decimals;
    const withdrawAmountHuman = formatRawAmount(
      BigInt(amountStroops),
      assetDecimals,
    );

    const depositedUsdHuman = Number(targetPosition.depositedUsd);
    const oraclePricePerUnit =
      depositedUsdHuman > 0 && Number(targetPosition.depositedRaw) > 0
        ? depositedUsdHuman /
          formatRawAmount(targetPosition.depositedRaw, assetDecimals)
        : 0;
    const withdrawUsdDelta = withdrawAmountHuman * oraclePricePerUnit;

    if (oraclePricePerUnit <= 0) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: null,
        errorKind: SolvencyErrorKind.ORACLE_UNAVAILABLE,
        detail: `Oracle price unavailable for asset ${targetPosition.asset.code}`,
        missingPrices: [targetPosition.asset.code],
      };
    }

    const assetCode = targetPosition.asset.code;
    const isStale = targetPosition.isStale;
    const stalePrices: string[] = [];

    if (isStale) {
      stalePrices.push(assetCode);
    }

    const priceMap: Record<string, OraclePriceEntry> = {};
    const assetRegistry: Record<
      string,
      { code: string; minCollateralRatio?: number | null }
    > = {};

    for (const pos of positions) {
      const code = pos.asset.code;
      const posDepositedUsd = Number(pos.depositedUsd);
      const posDepositedRaw = Number(pos.depositedRaw);
      const posBorrowedUsd = Number(pos.borrowedUsd);
      const posBorrowedRaw = Number(pos.borrowedRaw);
      const posDecimals = pos.asset.decimals;

      if (posDepositedUsd > 0 && posDepositedRaw > 0) {
        const pricePerUnit =
          posDepositedUsd /
          formatRawAmount(BigInt(posDepositedRaw), posDecimals);
        priceMap[code] = {
          priceUsd: pricePerUnit,
          updatedAt: pos.lastSyncAt ?? undefined,
          isStale: pos.isStale,
        };
      } else if (
        posBorrowedUsd > 0 &&
        posBorrowedRaw > 0 &&
        !(code in priceMap)
      ) {
        const pricePerUnit =
          posBorrowedUsd / formatRawAmount(BigInt(posBorrowedRaw), posDecimals);
        priceMap[code] = {
          priceUsd: pricePerUnit,
          updatedAt: pos.lastSyncAt ?? undefined,
          isStale: pos.isStale,
        };
      } else if (
        code === assetCode &&
        oraclePricePerUnit > 0 &&
        !(code in priceMap)
      ) {
        priceMap[code] = {
          priceUsd: oraclePricePerUnit,
          updatedAt: pos.lastSyncAt ?? undefined,
          isStale: pos.isStale,
        };
      }

      if (!(code in assetRegistry)) {
        assetRegistry[code] = {
          code,
          minCollateralRatio: pos.asset.minCollateralRatio ?? undefined,
        };
      }
    }

    const currentPositions: PositionLike[] = positions.map((p) => ({
      assetId: p.assetId,
      assetCode: p.asset.code,
      depositedUsd: Number(p.depositedUsd),
      borrowedUsd: Number(p.borrowedUsd),
      asset: {
        code: p.asset.code,
        minCollateralRatio: p.asset.minCollateralRatio,
      },
      isStale: p.isStale,
    }));

    const currentHf = computeHealthFactor(
      currentPositions,
      assetRegistry,
      priceMap,
      {
        allowStale: false,
        maxOracleAgeMs: MAX_ORACLE_AGE_MS,
        currentTime: now,
      },
    );

    if (currentHf.isStale && currentHf.healthFactor === null) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: null,
        errorKind: SolvencyErrorKind.ORACLE_UNAVAILABLE,
        detail: `Oracle prices stale or unavailable for: ${[...new Set([...currentHf.stalePrices, ...currentHf.missingPrices])].join(', ')}`,
        stalePrices: currentHf.stalePrices,
        missingPrices: currentHf.missingPrices,
      };
    }

    const projectedPositions: PositionLike[] = currentPositions.map((p) => {
      if (p.assetId === assetId) {
        return {
          ...p,
          depositedUsd: conservativeRound(
            Number(p.depositedUsd) - withdrawUsdDelta,
          ),
        };
      }
      return p;
    });

    const projectedHf = computeHealthFactor(
      projectedPositions,
      assetRegistry,
      priceMap,
      {
        allowStale: false,
        maxOracleAgeMs: MAX_ORACLE_AGE_MS,
        currentTime: now,
      },
    );

    if (projectedHf.isStale && projectedHf.healthFactor === null) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: currentHf.healthFactor,
        errorKind: SolvencyErrorKind.ORACLE_UNAVAILABLE,
        detail: `Oracle prices stale or unavailable after projection for: ${[...new Set([...projectedHf.stalePrices, ...projectedHf.missingPrices])].join(', ')}`,
        stalePrices: projectedHf.stalePrices,
        missingPrices: projectedHf.missingPrices,
      };
    }

    const projectedHfValue = projectedHf.healthFactor;

    const hasBorrow = currentPositions.some((p) => Number(p.borrowedUsd) > 0);

    if (!hasBorrow) {
      return {
        allowed: true,
        projectedHealthFactor: projectedHfValue,
        currentHealthFactor: currentHf.healthFactor,
      };
    }

    if (projectedHfValue !== null && projectedHfValue < MIN_HEALTH_FACTOR) {
      return {
        allowed: false,
        projectedHealthFactor: projectedHfValue,
        currentHealthFactor: currentHf.healthFactor,
        errorKind: SolvencyErrorKind.INSUFFICIENT_COLLATERAL,
        detail: `Withdrawal would push health factor below minimum (${projectedHfValue.toFixed(4)} < ${MIN_HEALTH_FACTOR})`,
      };
    }

    if (
      projectedHfValue === null &&
      currentHf.healthFactor !== null &&
      currentHf.healthFactor >= MIN_HEALTH_FACTOR
    ) {
      return {
        allowed: false,
        projectedHealthFactor: null,
        currentHealthFactor: currentHf.healthFactor,
        errorKind: SolvencyErrorKind.INSUFFICIENT_COLLATERAL,
        detail:
          'Projected health factor cannot be computed due to oracle data after withdrawal',
      };
    }

    return {
      allowed: true,
      projectedHealthFactor: projectedHfValue,
      currentHealthFactor: currentHf.healthFactor,
    };
  }

  /**
   * Validates the raw deposit amount check (used when oracle price is
   * unavailable to fall back to a simple depositedRaw comparison).
   */
  checkSufficientDeposit(depositedRaw: bigint, amountStroops: number): boolean {
    return depositedRaw >= BigInt(amountStroops);
  }
}

import { Injectable } from '@nestjs/common';
import {
  AssetRegistryEntry,
  computeHealthFactor,
  HealthFactorResult,
  OraclePriceEntry,
  PositionLike,
} from '../common/utils/health-factor.util';
import { OraclePriceService, ContractRiskParams } from './oracle-price.service';
import { UserPortfolio } from './risk.repository';
import {
  classifyHealthFactor,
  distanceToLiquidation,
  priceMoveToLiquidation,
  RiskBand,
} from './risk-band.util';

/** Protocol-wide liquidation incentive (seize ~10% bonus collateral). */
const LIQUIDATION_INCENTIVE = 1.1;
const DEFAULT_MCR = 1.25;

export interface UserRiskSnapshot {
  userId: string;
  walletAddress: string;
  band: RiskBand;
  riskStatus: 'priced' | 'unpriced';
  healthFactor: number | null;
  debtValueUsd: number;
  collateralValueUsd: number;
  weightedCollateralUsd: number;
  maxRepayableUsd: number;
  estSeizableUsd: number | null;
  distanceToLiquidation: number | null;
  priceMoveToLiquidation: number | null;
  primaryDebtAssetId: string | null;
  primaryDebtAssetCode: string | null;
  closeFactorBps: number;
  missingPrices: string[];
  stalePrices: string[];
}

/**
 * Shared risk computation for the scanner and the live /risk/positions view.
 * Stateless — persistence and notification decisions live in the scanner.
 */
@Injectable()
export class RiskReadService {
  constructor(private readonly oracle: OraclePriceService) {}

  /**
   * Computes the full risk snapshot for one user's portfolio using fresh
   * oracle prices. Never throws on oracle failure — degrades to an
   * `unpriced` snapshot instead.
   */
  async computeUserRisk(
    portfolio: UserPortfolio,
    contractId: string,
    params?: ContractRiskParams,
  ): Promise<UserRiskSnapshot> {
    const resolvedParams =
      params ?? (await this.oracle.getRiskParams(contractId));

    const activePositions = portfolio.positions.filter(
      (p) => p.depositedRaw > 0n || p.borrowedRaw > 0n,
    );

    // Fetch a price per distinct asset in the portfolio (per-tick cached).
    const priceEntries = new Map<string, OraclePriceEntry | null>();
    const assetIds = new Set(activePositions.map((p) => p.assetId));
    await Promise.all(
      Array.from(assetIds).map(async (assetId) => {
        priceEntries.set(
          assetId,
          await this.oracle.getPrice(
            contractId,
            assetId,
            resolvedParams.maxOracleAgeMs,
          ),
        );
      }),
    );

    // Registry keyed by BOTH id and code so the util resolves MCR either way.
    const assetRegistry: Record<string, AssetRegistryEntry> = {};
    for (const p of activePositions) {
      assetRegistry[p.assetId] = {
        id: p.asset.id,
        code: p.asset.code,
        minCollateralRatio: p.asset.minCollateralRatio ?? DEFAULT_MCR,
      };
      assetRegistry[p.asset.code] = assetRegistry[p.assetId];
    }

    const priceMap: Record<string, OraclePriceEntry> = {};
    for (const [assetId, entry] of priceEntries) {
      if (!entry) continue;
      priceMap[assetId] = entry;
      const code = activePositions.find((p) => p.assetId === assetId)?.asset
        .code;
      if (code) priceMap[code] = entry;
    }

    const anyPriceAvailable =
      Object.keys(priceMap).length > 0 && activePositions.length > 0;

    const positionLikes: PositionLike[] = activePositions.map((p) => ({
      assetId: p.assetId,
      assetCode: p.asset.code,
      depositedUsd: this.rawToUsd(
        p.depositedRaw,
        p.asset.decimals,
        p.assetId,
        priceMap,
      ),
      borrowedUsd: this.rawToUsd(
        p.borrowedRaw + p.accruedInterestRaw,
        p.asset.decimals,
        p.assetId,
        priceMap,
      ),
      isStale: priceEntries.get(p.assetId)?.isStale ?? true,
    }));

    let result: HealthFactorResult | null = null;
    if (anyPriceAvailable) {
      result = computeHealthFactor(positionLikes, assetRegistry, priceMap, {
        allowStale: false,
        maxOracleAgeMs: resolvedParams.maxOracleAgeMs,
      });
    }

    const unpriced =
      !anyPriceAvailable ||
      result === null ||
      result.missingPrices.length > 0 ||
      result.stalePrices.length > 0 ||
      result.healthFactor === null;

    const totalCollateralUsd = result?.totalCollateralUsd ?? 0;
    const totalBorrowedUsd = result?.totalBorrowedUsd ?? 0;
    const hf = unpriced ? null : (result as HealthFactorResult).healthFactor;

    const band = classifyHealthFactor(hf);
    const maxRepayableUsd =
      unpriced && hf === null
        ? 0
        : (totalBorrowedUsd * resolvedParams.closeFactorBps) / 10_000;

    // Largest single-asset debt (raw units) for queue display.
    let topDebt: { id: string | null; code: string | null; amountRaw: bigint } =
      {
        id: null,
        code: null,
        amountRaw: 0n,
      };
    for (const p of activePositions) {
      const debtRaw = p.borrowedRaw + p.accruedInterestRaw;
      if (debtRaw > topDebt.amountRaw) {
        topDebt = {
          id: p.asset.id,
          code: p.asset.code,
          amountRaw: debtRaw,
        };
      }
    }

    return {
      userId: portfolio.user.id,
      walletAddress: portfolio.user.walletAddress,
      band,
      riskStatus: unpriced ? 'unpriced' : 'priced',
      healthFactor: hf,
      debtValueUsd: totalBorrowedUsd,
      collateralValueUsd: totalCollateralUsd,
      weightedCollateralUsd:
        result?.totalWeightedCollateralUsd ?? totalCollateralUsd,
      maxRepayableUsd,
      estSeizableUsd:
        !unpriced && band === 'liquidatable'
          ? maxRepayableUsd * LIQUIDATION_INCENTIVE
          : null,
      distanceToLiquidation: distanceToLiquidation(hf),
      priceMoveToLiquidation: priceMoveToLiquidation(hf),
      primaryDebtAssetId: topDebt.id,
      primaryDebtAssetCode: topDebt.code,
      closeFactorBps: resolvedParams.closeFactorBps,
      missingPrices: result?.missingPrices ?? [],
      stalePrices: result?.stalePrices ?? [],
    };
  }

  private rawToUsd(
    rawAmount: bigint,
    decimals: number,
    assetId: string,
    priceMap: Record<string, OraclePriceEntry>,
  ): number {
    const entry = priceMap[assetId];
    if (!entry) return 0;
    return (Number(rawAmount) / Math.pow(10, decimals)) * entry.priceUsd;
  }
}

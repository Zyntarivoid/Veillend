export interface PositionLike {
  assetId: string;
  assetCode?: string;
  depositedUsd: number | string;
  borrowedUsd: number | string;
  asset?: {
    code?: string;
    minCollateralRatio?: number | null;
    minCollateralRatioBps?: number | null;
  };
  isStale?: boolean;
}

export interface AssetRegistryEntry {
  id?: string;
  code: string;
  minCollateralRatio?: number | null;
  minCollateralRatioBps?: number | null;
}

export interface OraclePriceEntry {
  priceUsd: number;
  updatedAt?: Date | string | number;
  isStale?: boolean;
}

export interface ComputeHealthFactorOptions {
  /** If true, compute best-effort health factor even when oracle prices are stale or missing */
  allowStale?: boolean;
  /** Maximum oracle age in milliseconds before a price is flagged as stale (default: 300_000ms = 5m) */
  maxOracleAgeMs?: number;
  /** Current reference timestamp in ms (default: Date.now()) */
  currentTime?: number;
  /** Default min collateral ratio when unspecified on asset (default: 0.8) */
  defaultMinCollateralRatio?: number;
  /** Accumulated bad debt in USD to factor into hfWithBadDebt */
  badDebtUsd?: number;
}

export interface HealthFactorResult {
  /** Health factor with weighted collateral. Null if active position has missing/stale prices and allowStale is false */
  healthFactor: number | null;
  /** Health factor excluding residual bad debt */
  hfExBadDebt: number | null;
  /** Health factor including residual bad debt in denominator */
  hfWithBadDebt: number | null;
  totalCollateralUsd: number;
  totalWeightedCollateralUsd: number;
  totalBorrowedUsd: number;
  availableToBorrow: number;
  badDebtUsd: number;
  isStale: boolean;
  stalePrices: string[];
  missingPrices: string[];
}

const DEFAULT_MAX_ORACLE_AGE_MS = 300_000; // 5 minutes
const DEFAULT_MCR = 0.8; // 80%

/**
 * Pure function to compute portfolio health factor according to on-chain Soroban lending rules:
 *
 *   Weighted Collateral = sum(depositedUsd_i * MCR_i)
 *   Total Borrowed = sum(borrowedUsd_i)
 *   Health Factor = Weighted Collateral / Total Borrowed
 *
 * Also checks oracle staleness and accounts for residual bad debt.
 */
export function computeHealthFactor(
  positions: PositionLike[],
  assetRegistry: Record<string, AssetRegistryEntry> = {},
  priceMap: Record<string, OraclePriceEntry> = {},
  options: ComputeHealthFactorOptions = {},
): HealthFactorResult {
  const allowStale = options.allowStale ?? false;
  const maxOracleAgeMs = options.maxOracleAgeMs ?? DEFAULT_MAX_ORACLE_AGE_MS;
  const now = options.currentTime ?? Date.now();
  const defaultMcr = options.defaultMinCollateralRatio ?? DEFAULT_MCR;
  const badDebtUsd = Math.max(0, options.badDebtUsd ?? 0);

  let totalCollateralUsd = 0;
  let totalWeightedCollateralUsd = 0;
  let totalBorrowedUsd = 0;

  const stalePricesSet = new Set<string>();
  const missingPricesSet = new Set<string>();

  for (const pos of positions) {
    const depositedUsd = Number(pos.depositedUsd) || 0;
    const borrowedUsd = Number(pos.borrowedUsd) || 0;
    const assetCode = pos.assetCode || pos.asset?.code || pos.assetId;

    totalCollateralUsd += depositedUsd;
    totalBorrowedUsd += borrowedUsd;

    // Resolve per-asset Min Collateral Ratio (MCR)
    const registryAsset =
      assetRegistry[assetCode] || assetRegistry[pos.assetId];
    let mcr = defaultMcr;

    if (pos.asset?.minCollateralRatioBps != null) {
      mcr = pos.asset.minCollateralRatioBps / 10_000;
    } else if (pos.asset?.minCollateralRatio != null) {
      mcr = pos.asset.minCollateralRatio;
    } else if (registryAsset?.minCollateralRatioBps != null) {
      mcr = registryAsset.minCollateralRatioBps / 10_000;
    } else if (registryAsset?.minCollateralRatio != null) {
      mcr = registryAsset.minCollateralRatio;
    }

    // Clamp MCR to valid range [0, 1]
    mcr = Math.max(0, Math.min(1, mcr));

    totalWeightedCollateralUsd += depositedUsd * mcr;

    // Oracle staleness validation for active positions (deposited > 0 or borrowed > 0)
    const isLivePosition = depositedUsd > 0 || borrowedUsd > 0;
    if (isLivePosition) {
      if (pos.isStale) {
        stalePricesSet.add(assetCode);
      }

      const priceEntry = priceMap[assetCode] || priceMap[pos.assetId];
      if (Object.keys(priceMap).length > 0) {
        if (!priceEntry) {
          missingPricesSet.add(assetCode);
        } else {
          if (priceEntry.isStale) {
            stalePricesSet.add(assetCode);
          }
          if (priceEntry.updatedAt) {
            const updatedTimestamp =
              typeof priceEntry.updatedAt === 'number'
                ? priceEntry.updatedAt
                : new Date(priceEntry.updatedAt).getTime();
            if (now - updatedTimestamp > maxOracleAgeMs) {
              stalePricesSet.add(assetCode);
            }
          }
        }
      }
    }
  }

  const stalePrices = Array.from(stalePricesSet);
  const missingPrices = Array.from(missingPricesSet);
  const isStale = stalePrices.length > 0 || missingPrices.length > 0;

  const availableToBorrow = Math.max(
    0,
    totalWeightedCollateralUsd - totalBorrowedUsd,
  );

  let rawHf: number;
  let hfExBadDebt: number;
  let hfWithBadDebt: number;

  if (totalBorrowedUsd <= 0) {
    rawHf = Infinity;
    hfExBadDebt = Infinity;
    hfWithBadDebt =
      badDebtUsd > 0 ? totalWeightedCollateralUsd / badDebtUsd : Infinity;
  } else {
    rawHf = totalWeightedCollateralUsd / totalBorrowedUsd;
    hfExBadDebt = rawHf;
    hfWithBadDebt =
      totalWeightedCollateralUsd / (totalBorrowedUsd + badDebtUsd);
  }

  const shouldNullifyHf =
    isStale && !allowStale && (totalCollateralUsd > 0 || totalBorrowedUsd > 0);
  const finalHf = shouldNullifyHf ? null : rawHf;

  return {
    healthFactor: finalHf,
    hfExBadDebt: shouldNullifyHf ? null : hfExBadDebt,
    hfWithBadDebt: shouldNullifyHf ? null : hfWithBadDebt,
    totalCollateralUsd,
    totalWeightedCollateralUsd,
    totalBorrowedUsd,
    availableToBorrow,
    badDebtUsd,
    isStale,
    stalePrices,
    missingPrices,
  };
}

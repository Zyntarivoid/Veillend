export class PositionSummaryDto {
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetSymbol: string;
  /** Deposited (collateral) amount, formatted using the asset's decimals. */
  readonly deposited: number;
  /** Outstanding debt, formatted using the asset's decimals. */
  readonly borrowed: number;
  readonly depositedUsd: number;
  readonly borrowedUsd: number;
  readonly minCollateralRatio?: number | null;
  readonly healthFactor: number | null;
  readonly privacyMode: boolean;
  readonly isStale: boolean;
}

export class PortfolioResponseDto {
  readonly walletAddress: string;
  readonly collateralValue: number;
  readonly borrowedValue: number;
  readonly availableToBorrow: number;
  /** Weighted collateral / sum(borrowed) across all positions; Infinity when there is no debt. Null if oracle prices are stale. */
  readonly healthFactor: number | null;
  /** Health factor excluding residual bad debt */
  readonly hfExBadDebt?: number | null;
  /** Health factor including residual bad debt */
  readonly hfWithBadDebt?: number | null;
  /** Accumulated residual bad debt post-liquidation in USD */
  readonly badDebtUsd?: number;
  /** Whether any position has a stale or missing oracle price */
  readonly isStale?: boolean;
  /** List of asset codes with stale prices */
  readonly stalePrices?: string[];
  /** List of asset codes with missing prices */
  readonly missingPrices?: string[];
  readonly positions: PositionSummaryDto[];
}

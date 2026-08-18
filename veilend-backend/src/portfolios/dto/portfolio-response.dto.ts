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
  readonly healthFactor: number | null;
  readonly privacyMode: boolean;
  readonly isStale: boolean;
}

export class PortfolioResponseDto {
  readonly walletAddress: string;
  readonly collateralValue: number;
  readonly borrowedValue: number;
  readonly availableToBorrow: number;
  /** sum(collateral) / sum(borrowed) across all positions; Infinity when there is no debt. */
  readonly healthFactor: number;
  readonly positions: PositionSummaryDto[];
}

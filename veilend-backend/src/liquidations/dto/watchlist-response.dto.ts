export class WatchlistPositionDto {
  readonly id: string;
  readonly userId: string;
  readonly walletAddress: string;
  readonly borrowedAsset: string;
  readonly collateralAsset: string;
  readonly borrowedUsd: number;
  readonly collateralUsd: number;
  readonly healthFactor: number;
  readonly shortfallUsd: number;
  readonly seizableCollateralUsd: number;
  readonly liquidationDiscountPercent: number;
  readonly expectedProfitUsd: number;
  readonly isMyRisk: boolean;
}

export class WatchlistPoolDto {
  readonly assetId: string;
  readonly asset: string;
  readonly utilizationPercent: number;
  readonly isMyPool: boolean;
}

export class WatchlistResponseDto {
  readonly myRisk: WatchlistPositionDto[];
  readonly opportunities: WatchlistPositionDto[];
  readonly pools: WatchlistPoolDto[];
  readonly myLiquidationsPast: Array<{
    id: string;
    status: string;
    amountUsd: number;
    asset: string;
    txHash: string | null;
    createdAt: Date;
    confirmedAt: Date | null;
  }>;
}

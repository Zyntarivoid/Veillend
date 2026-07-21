import { Expose, Type } from 'class-transformer';

/**
 * Per-asset risk parameters included in the protocol config response.
 */
export class AssetRiskConfigDto {
  @Expose()
  code: string;

  @Expose()
  symbol: string;

  @Expose()
  collateralFactor: number;

  @Expose()
  liquidationThreshold: number;

  @Expose()
  isSupported: boolean;
}

/**
 * Stellar network configuration.
 */
export class NetworkConfigDto {
  @Expose()
  network: string;

  @Expose()
  horizonUrl: string;

  @Expose()
  sorobanRpcUrl: string;

  @Expose()
  networkPassphrase: string;

  @Expose()
  contractId: string;
}

/**
 * Protocol-wide risk & collateral parameters.
 */
export class RiskParametersDto {
  @Expose()
  minCollateralRatio: number;

  @Expose()
  defaultCollateralFactor: number;

  @Expose()
  defaultLiquidationThreshold: number;

  @Expose()
  closeFactor: number;

  @Expose()
  liquidationIncentive: number;
}

/**
 * Full protocol configuration returned by GET /protocol/config.
 */
export class ProtocolConfigResponseDto {
  @Expose()
  network: NetworkConfigDto;

  @Expose()
  riskParameters: RiskParametersDto;

  @Expose()
  @Type(() => AssetRiskConfigDto)
  assets: AssetRiskConfigDto[];

  @Expose()
  supportedAssetCount: number;

  @Expose()
  cachedAt: string;
}

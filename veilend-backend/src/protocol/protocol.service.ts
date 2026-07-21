import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import {
  ProtocolConfigResponseDto,
  NetworkConfigDto,
  RiskParametersDto,
  AssetRiskConfigDto,
} from './dto/protocol-config-response.dto';
import { plainToInstance } from 'class-transformer';

/**
 * Simple in-memory cache with TTL for protocol config.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Default protocol risk parameters.
 * In production these would come from the Soroban contract or an admin table.
 */
const DEFAULT_RISK_PARAMETERS: RiskParametersDto = {
  minCollateralRatio: 1.25, // 125%
  defaultCollateralFactor: 0.75, // 75%
  defaultLiquidationThreshold: 0.8, // 80%
  closeFactor: 0.5, // 50% of debt can be liquidated at once
  liquidationIncentive: 1.1, // 10% bonus to liquidators
};

@Injectable()
export class ProtocolService {
  private readonly logger = new Logger(ProtocolService.name);

  /** Cache TTL: 120 seconds (protocol config changes rarely) */
  private readonly CACHE_TTL_MS = 120_000;

  private configCache: CacheEntry<ProtocolConfigResponseDto> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Returns the full protocol configuration:
   * - Network settings (Stellar network, RPC URLs, contract ID)
   * - Risk parameters (collateral factors, liquidation thresholds)
   * - Per-asset risk configuration
   */
  async getConfig(): Promise<ProtocolConfigResponseDto> {
    const now = Date.now();

    if (this.configCache && this.configCache.expiresAt > now) {
      return this.configCache.data;
    }

    this.logger.debug('Cache miss – building protocol config');

    const network = this.buildNetworkConfig();
    const riskParameters = DEFAULT_RISK_PARAMETERS;
    const assets = await this.buildAssetRiskConfigs();

    const response = plainToInstance(ProtocolConfigResponseDto, {
      network,
      riskParameters,
      assets,
      supportedAssetCount: assets.filter((a) => a.isSupported).length,
      cachedAt: new Date().toISOString(),
    });

    this.configCache = {
      data: response,
      expiresAt: now + this.CACHE_TTL_MS,
    };

    return response;
  }

  /**
   * Invalidate the protocol config cache.
   */
  invalidateCache(): void {
    this.configCache = null;
    this.logger.debug('Protocol config cache invalidated');
  }

  private buildNetworkConfig(): NetworkConfigDto {
    const stellar = this.appConfig.stellar;
    const indexer = this.appConfig.indexer;

    return plainToInstance(NetworkConfigDto, {
      network: stellar.network,
      horizonUrl: stellar.horizonUrl,
      sorobanRpcUrl: stellar.sorobanRpcUrl,
      networkPassphrase: stellar.networkPassphrase,
      contractId: indexer.contractId,
    });
  }

  private async buildAssetRiskConfigs(): Promise<AssetRiskConfigDto[]> {
    const assets = await this.prisma.asset.findMany({
      orderBy: [{ isSupported: 'desc' }, { code: 'asc' }],
    });

    return assets.map((asset) =>
      plainToInstance(AssetRiskConfigDto, {
        code: asset.code,
        symbol: asset.symbol,
        // Default risk params per asset type; in production these come from contract state
        collateralFactor: asset.isNative
          ? 0.6
          : asset.code === 'USDC'
            ? 0.75
            : 0.7,
        liquidationThreshold: asset.isNative
          ? 0.7
          : asset.code === 'USDC'
            ? 0.8
            : 0.78,
        isSupported: asset.isSupported,
      }),
    );
  }
}

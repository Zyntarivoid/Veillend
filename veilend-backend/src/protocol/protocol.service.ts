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
import { ProtocolChainReader } from './protocol-chain-reader';
import { bpsToConservativeDecimal } from './bps.util';

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
  private lastKnownGood: {
    data: ProtocolConfigResponseDto;
    cachedAt: number;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly chainReader: ProtocolChainReader,
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

    try {
      const response = await this.buildChainConfig();
      this.configCache = { data: response, expiresAt: now + this.CACHE_TTL_MS };
      this.lastKnownGood = { data: response, cachedAt: now };
      return response;
    } catch (error) {
      if (this.lastKnownGood && now - this.lastKnownGood.cachedAt <= 600_000) {
        return plainToInstance(ProtocolConfigResponseDto, {
          ...this.lastKnownGood.data,
          staleAsOf: new Date(this.lastKnownGood.cachedAt).toISOString(),
        });
      }
      this.logger.warn(
        `Protocol chain read failed; serving fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.buildFallbackConfig();
    }
  }

  /**
   * Invalidate the protocol config cache.
   */
  invalidateCache(): void {
    this.configCache = null;
    this.logger.debug('Protocol config cache invalidated');
  }

  /**
   * Protocol-wide minimum collateral ratio in basis points (e.g. 12500 =
   * 125%), used by portfolio health-factor math. Per-asset overrides live on
   * `Asset.minCollateralRatio`; this is the fallback for the aggregate view.
   */
  getMinCollateralRatioBps(): number {
    return Math.round(DEFAULT_RISK_PARAMETERS.minCollateralRatio * 10_000);
  }

  getReachability(): 'ok' | 'stale' | 'unavailable' {
    if (this.configCache) return 'ok';
    return this.lastKnownGood ? 'stale' : 'unavailable';
  }

  private async buildChainConfig(): Promise<ProtocolConfigResponseDto> {
    const dbAssets = await this.prisma.asset.findMany({
      orderBy: [{ isSupported: 'desc' }, { code: 'asc' }],
    });
    const chain = await this.chainReader.read(
      this.appConfig.indexer.contractId,
      dbAssets,
    );
    const assets = dbAssets.map((asset) => {
      const live = asset.contractId
        ? chain.assets.get(asset.contractId)
        : undefined;
      return plainToInstance(AssetRiskConfigDto, {
        code: asset.code,
        symbol: asset.symbol,
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
        isSupported: live?.isSupported ?? false,
        supplyCap: live?.supplyCap,
        borrowCap: live?.borrowCap,
        oracle: live?.oracle,
      });
    });
    const metadata = chain.metadata;
    return plainToInstance(ProtocolConfigResponseDto, {
      source: 'chain',
      network: this.buildNetworkConfig(),
      riskParameters: {
        ...DEFAULT_RISK_PARAMETERS,
        minCollateralRatio: bpsToConservativeDecimal(
          chain.minCollateralRatioBps,
        ),
        closeFactor: bpsToConservativeDecimal(chain.closeFactorBps),
      },
      assets,
      supportedAssetCount: assets.filter((a) => a.isSupported).length,
      cachedAt: new Date().toISOString(),
      paused: chain.paused,
      timelockLedgers: chain.timelockLedgers,
      contractVersion: Number(metadata.contract_version),
      storageSchemaVersion: Number(metadata.storage_schema_version),
    });
  }

  private async buildFallbackConfig(): Promise<ProtocolConfigResponseDto> {
    const assets = await this.buildAssetRiskConfigs();
    return plainToInstance(ProtocolConfigResponseDto, {
      source: 'fallback',
      network: this.buildNetworkConfig(),
      riskParameters: DEFAULT_RISK_PARAMETERS,
      assets,
      supportedAssetCount: assets.filter((a) => a.isSupported).length,
      cachedAt: new Date().toISOString(),
    });
  }

  private buildNetworkConfig(): NetworkConfigDto {
    const stellar = this.appConfig.stellar;
    const indexer = this.appConfig.indexer;

    return plainToInstance(NetworkConfigDto, {
      network: stellar.network,
      horizonUrl: stellar.horizonUrls[0],
      sorobanRpcUrl: stellar.sorobanRpcUrls[0],
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

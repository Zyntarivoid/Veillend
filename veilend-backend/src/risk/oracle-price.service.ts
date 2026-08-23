import { Injectable, Logger } from '@nestjs/common';
import { nativeToScVal, Address } from '@stellar/stellar-sdk';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { OraclePriceEntry } from '../common/utils/health-factor.util';

/** Contract prices are fixed-point with 1e8 scale (USD×1e8 per unit). */
const PRICE_SCALE = 100_000_000n;
const DEFAULT_MAX_ORACLE_AGE_SECONDS = 86_400;

export interface ContractRiskParams {
  /** Close factor in bps (e.g. 5000 = 50% of debt repayable per liquidation). */
  closeFactorBps: number;
  /** Max acceptable oracle age in ms. */
  maxOracleAgeMs: number;
}

@Injectable()
export class OraclePriceService {
  private readonly logger = new Logger(OraclePriceService.name);

  /** Per-tick cache so a scan pass hits each asset's oracle entry once. */
  private tickCache = new Map<string, OraclePriceEntry | null>();
  private paramsCache: ContractRiskParams | null = null;

  constructor(private readonly rpc: SorobanRpcService) {}

  /**
   * Clears the per-tick caches. Call at the start of each scan cycle (or
   * request) so prices are re-read at most once per asset per tick.
   */
  beginTick(): void {
    this.tickCache.clear();
    this.paramsCache = null;
  }

  /**
   * Reads the liquidation engine's on-chain parameters. Falls back to safe
   * defaults when the contract is unreachable.
   */
  async getRiskParams(contractId: string): Promise<ContractRiskParams> {
    if (this.paramsCache) return this.paramsCache;

    const [closeFactorBps, maxOracleAgeSeconds] = await Promise.all([
      this.rpc.simulateContractCall<number>(contractId, 'close_factor_bps'),
      this.rpc.simulateContractCall<number>(contractId, 'get_max_oracle_age'),
    ]);

    const params: ContractRiskParams = {
      closeFactorBps:
        typeof closeFactorBps === 'number' && closeFactorBps > 0
          ? closeFactorBps
          : 5000,
      maxOracleAgeMs: (function () {
        const secs =
          typeof maxOracleAgeSeconds === 'number' && maxOracleAgeSeconds > 0
            ? maxOracleAgeSeconds
            : DEFAULT_MAX_ORACLE_AGE_SECONDS;
        return secs * 1_000;
      })(),
    };

    this.paramsCache = params;
    return params;
  }

  /**
   * Fetches the USD price for one asset from the protocol oracle.
   * Returns null when the oracle has no price for the asset or the call fails.
   * `updatedAt` is the fetch time; `isStale` is true when the contract reports
   * an on-chain timestamp older than its own max age.
   */
  async getPrice(
    contractId: string,
    assetId: string,
    maxOracleAgeMs: number,
  ): Promise<OraclePriceEntry | null> {
    if (this.tickCache.has(assetId)) {
      return this.tickCache.get(assetId) ?? null;
    }

    let entry: OraclePriceEntry | null = null;

    try {
      const result = await this.rpc.simulateContractCall<unknown>(
        contractId,
        'get_oracle_price_with_age',
        [nativeToScVal(new Address(assetId), { type: 'address' })],
      );

      // Option<(i128 price, u64 timestamp)> → null when None, array when Some
      if (
        Array.isArray(result) &&
        result.length >= 2 &&
        typeof result[0] === 'bigint'
      ) {
        const rawPrice = result[0];
        const fetchedAt = Date.now();

        // Second element is a unix-seconds timestamp; treat implausible
        // values as "unknown freshness" and rely on fetch time instead.
        let isStale = false;
        if (typeof result[1] === 'bigint' && result[1] > 1_000_000_000n) {
          const chainTsMs = Number(result[1]) * 1_000;
          isStale = Date.now() - chainTsMs > maxOracleAgeMs;
        }

        entry = {
          priceUsd: Number(rawPrice) / Number(PRICE_SCALE),
          updatedAt: new Date(fetchedAt),
          isStale,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Oracle price read failed for ${assetId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      entry = null;
    }

    this.tickCache.set(assetId, entry);
    return entry;
  }
}

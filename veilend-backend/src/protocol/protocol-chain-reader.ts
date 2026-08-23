import { Injectable } from '@nestjs/common';
import { Address } from '@stellar/stellar-sdk';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';

export interface ChainAssetConfig {
  contractId: string;
  isSupported: boolean;
  supplyCap: string;
  borrowCap: string;
  oracle: { price: string | null; ageSeconds: number | null; isStale: boolean; minBound: string | null; maxBound: string | null; maxChangeBps: number | null };
}

const asRecord = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
const stringValue = (value: unknown): string => String(value);

@Injectable()
export class ProtocolChainReader {
  constructor(private readonly rpc: SorobanRpcService) {}

  async read(contractId: string, assets: { contractId: string | null }[]) {
    const [minCollateralRatioBps, closeFactorBps, paused, timelockLedgers, maxOracleAge, metadata] = await Promise.all([
      this.rpc.simulateContractCall(contractId, 'min_collateral_ratio_bps'),
      this.rpc.simulateContractCall(contractId, 'close_factor_bps'),
      this.rpc.simulateContractCall(contractId, 'is_paused'),
      this.rpc.simulateContractCall(contractId, 'get_timelock_ledgers'),
      this.rpc.simulateContractCall(contractId, 'get_max_oracle_age'),
      this.rpc.simulateContractCall(contractId, 'contract_metadata'),
    ]);
    const configured = assets.filter((asset): asset is { contractId: string } => !!asset.contractId);
    const assetConfigs = await this.mapLimit(configured, 5, (asset) => this.readAsset(contractId, asset.contractId!, Number(maxOracleAge)));
    return { minCollateralRatioBps: Number(minCollateralRatioBps), closeFactorBps: Number(closeFactorBps), paused: Boolean(paused), timelockLedgers: Number(timelockLedgers), metadata: asRecord(metadata), assets: new Map(assetConfigs.map((asset) => [asset.contractId, asset])) };
  }

  private async readAsset(contractId: string, assetId: string, maxAge: number): Promise<ChainAssetConfig> {
    const args = [Address.fromString(assetId).toScVal()];
    const [caps, supplyCap, borrowCap, priceWithAge, bounds, maxChangeBps, isSupported] = await Promise.all([
      this.rpc.simulateContractCall(contractId, 'get_asset_caps', args), this.rpc.simulateContractCall(contractId, 'supply_cap', args), this.rpc.simulateContractCall(contractId, 'borrow_cap', args), this.rpc.simulateContractCall(contractId, 'get_oracle_price_with_age', args), this.rpc.simulateContractCall(contractId, 'get_oracle_price_bounds', args), this.rpc.simulateContractCall(contractId, 'get_oracle_max_change_bps', args), this.rpc.simulateContractCall(contractId, 'is_asset_supported', args),
    ]);
    const cap = asRecord(caps); const price = Array.isArray(priceWithAge) ? priceWithAge : null; const bound = Array.isArray(bounds) ? bounds : [];
    return { contractId: assetId, isSupported: Boolean(isSupported), supplyCap: stringValue(cap.deposit_cap ?? supplyCap), borrowCap: stringValue(cap.borrow_cap ?? borrowCap), oracle: { price: price ? stringValue(price[0]) : null, ageSeconds: price ? Number(price[1]) : null, isStale: price ? Number(price[1]) > maxAge : true, minBound: bound[0] == null ? null : stringValue(bound[0]), maxBound: bound[1] == null ? null : stringValue(bound[1]), maxChangeBps: Number(maxChangeBps) } };
  }

  private async mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = []; let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await work(items[index]); } }));
    return results;
  }
}

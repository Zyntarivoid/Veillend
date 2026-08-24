import { ProtocolChainReader } from './protocol-chain-reader';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';

describe('ProtocolChainReader', () => {
  const call = jest.fn();
  const assetId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
  const values: Record<string, unknown> = {
    min_collateral_ratio_bps: 12_500,
    close_factor_bps: 5_000,
    is_paused: true,
    get_timelock_ledgers: 42,
    get_max_oracle_age: 60,
    contract_metadata: { contract_version: 2, storage_schema_version: 3 },
    get_asset_caps: { deposit_cap: 1000n, borrow_cap: 500n },
    supply_cap: 1000n,
    borrow_cap: 500n,
    get_oracle_price_with_age: [123n, 61n],
    get_oracle_price_bounds: [100n, 200n],
    get_oracle_max_change_bps: 250,
    is_asset_supported: true,
  };

  beforeEach(() =>
    call.mockImplementation((_id: string, method: string): Promise<unknown> =>
      Promise.resolve(values[method]),
    ),
  );

  it('maps all protocol and per-asset live state', async () => {
    const reader = new ProtocolChainReader({
      simulateContractCall: call,
    } as unknown as SorobanRpcService);
    const result = await reader.read(assetId, [{ contractId: assetId }]);
    const asset = result.assets.get(assetId)!;
    expect(result).toMatchObject({
      minCollateralRatioBps: 12_500,
      closeFactorBps: 5_000,
      paused: true,
      timelockLedgers: 42,
    });
    expect(asset).toMatchObject({
      isSupported: true,
      supplyCap: '1000',
      borrowCap: '500',
      oracle: {
        price: '123',
        ageSeconds: 61,
        isStale: true,
        minBound: '100',
        maxBound: '200',
        maxChangeBps: 250,
      },
    });
  });
});

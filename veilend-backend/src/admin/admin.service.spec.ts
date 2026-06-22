import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const configValues: Record<string, string | number> = {
    'stellar.networkPassphrase': 'Test SDF Network ; September 2015',
    'stellar.horizonUrl': 'https://horizon-testnet.stellar.org',
    'stellar.sorobanRpcUrl': 'https://soroban-testnet.stellar.org',
    'indexer.contractId': 'CCONTRACT',
    'indexer.startLedger': 123,
    'indexer.pollIntervalMs': 2500,
  };

  let service: AdminService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, fallback: string | number) => {
        return configValues[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    service = new AdminService(configService);
  });

  it('returns network, risk, collateral, and cache configuration', () => {
    const response = service.getProtocolConfig();

    expect(response.protocol).toBe('VeilLend');
    expect(response.schemaVersion).toBe(1);
    expect(response.network).toEqual({
      name: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      contractId: 'CCONTRACT',
      indexerStartLedger: 123,
      indexerPollIntervalMs: 2500,
    });
    expect(response.risk.minCollateralRatioBps).toBe(15_000);
    expect(response.collateralRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetSymbol: 'XLM' }),
        expect.objectContaining({ assetSymbol: 'USDC' }),
      ]),
    );
    expect(response.cache.ttlSeconds).toBe(60);
  });

  it('returns risk configuration separately', () => {
    const response = service.getRiskConfig();

    expect(response.risk.maxLoanToValueBps).toBe(6_666);
    expect(response.collateralRules).toHaveLength(2);
  });
});

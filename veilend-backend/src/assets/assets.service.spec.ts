import { NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  let service: AssetsService;

  beforeEach(() => {
    service = new AssetsService();
  });

  it('returns supported asset metadata with cache hints', () => {
    const response = service.getSupportedAssets();

    expect(response.cache.ttlSeconds).toBe(60);
    expect(response.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: 'XLM',
          stellarAssetType: 'native',
          decimals: 7,
          supported: true,
        }),
        expect.objectContaining({
          symbol: 'USDC',
          stellarAssetType: 'credit_alphanum4',
          decimals: 7,
          supported: true,
        }),
      ]),
    );
  });

  it('returns a single asset by symbol case-insensitively', () => {
    const asset = service.getAssetBySymbol('xlm');

    expect(asset.symbol).toBe('XLM');
    expect(asset.risk.collateralFactorBps).toBeGreaterThan(0);
  });

  it('throws for unsupported assets', () => {
    expect(() => service.getAssetBySymbol('DOGE')).toThrow(NotFoundException);
  });
});

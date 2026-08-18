import { computeHealthFactor } from './health-factor.util';

describe('computeHealthFactor', () => {
  it('calculates exact hand-calculated health factor for two-collateral, one-borrow scenario', () => {
    // Hand-calculated acceptance test from Issue #384:
    // XLM (mcr = 0.7), $100 deposited -> weighted collateral = $70
    // ETH (mcr = 0.65), $200 deposited -> weighted collateral = $130
    // Total weighted collateral = $200
    // Borrow = $150 USDC
    // Expected HF = 200 / 150 = 1.3333333333333333
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 0,
        asset: { code: 'XLM', minCollateralRatio: 0.7 },
      },
      {
        assetId: 'eth-id',
        assetCode: 'ETH',
        depositedUsd: 200,
        borrowedUsd: 0,
        asset: { code: 'ETH', minCollateralRatio: 0.65 },
      },
      {
        assetId: 'usdc-id',
        assetCode: 'USDC',
        depositedUsd: 0,
        borrowedUsd: 150,
        asset: { code: 'USDC', minCollateralRatio: 0.8 },
      },
    ];

    const result = computeHealthFactor(positions);

    expect(result.totalCollateralUsd).toBe(300);
    expect(result.totalWeightedCollateralUsd).toBe(200);
    expect(result.totalBorrowedUsd).toBe(150);
    expect(result.healthFactor).toBeCloseTo(200 / 150, 6);
    expect(result.isStale).toBe(false);
    expect(result.stalePrices).toEqual([]);
    expect(result.missingPrices).toEqual([]);
  });

  it('supports minCollateralRatioBps in basis points (e.g. 7000 bps = 0.70)', () => {
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 0,
        asset: { code: 'XLM', minCollateralRatioBps: 7000 },
      },
      {
        assetId: 'usdc-id',
        assetCode: 'USDC',
        depositedUsd: 0,
        borrowedUsd: 50,
        asset: { code: 'USDC', minCollateralRatioBps: 8000 },
      },
    ];

    const result = computeHealthFactor(positions);
    expect(result.totalWeightedCollateralUsd).toBe(70);
    expect(result.healthFactor).toBeCloseTo(70 / 50, 6);
  });

  it('returns healthFactor: null when position price is stale and allowStale is false', () => {
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 0,
        asset: { code: 'XLM', minCollateralRatio: 0.7 },
        isStale: true,
      },
      {
        assetId: 'usdc-id',
        assetCode: 'USDC',
        depositedUsd: 0,
        borrowedUsd: 50,
        asset: { code: 'USDC', minCollateralRatio: 0.8 },
        isStale: false,
      },
    ];

    const result = computeHealthFactor(
      positions,
      {},
      {},
      { allowStale: false },
    );

    expect(result.isStale).toBe(true);
    expect(result.stalePrices).toContain('XLM');
    expect(result.healthFactor).toBeNull();
  });

  it('returns best-effort healthFactor when allowStale is true despite stale price', () => {
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 0,
        asset: { code: 'XLM', minCollateralRatio: 0.7 },
        isStale: true,
      },
      {
        assetId: 'usdc-id',
        assetCode: 'USDC',
        depositedUsd: 0,
        borrowedUsd: 50,
        asset: { code: 'USDC', minCollateralRatio: 0.8 },
        isStale: false,
      },
    ];

    const result = computeHealthFactor(positions, {}, {}, { allowStale: true });

    expect(result.isStale).toBe(true);
    expect(result.stalePrices).toContain('XLM');
    expect(result.healthFactor).toBeCloseTo(70 / 50, 6);
  });

  it('flags oracle prices older than maxOracleAgeMs as stale', () => {
    const now = 1_700_000_000_000;
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 50,
        asset: { code: 'XLM', minCollateralRatio: 0.8 },
      },
    ];

    const priceMap = {
      XLM: {
        priceUsd: 0.12,
        updatedAt: now - 600_000, // 10 minutes old (exceeds 5m default)
      },
    };

    const result = computeHealthFactor(positions, {}, priceMap, {
      currentTime: now,
      maxOracleAgeMs: 300_000,
      allowStale: false,
    });

    expect(result.isStale).toBe(true);
    expect(result.stalePrices).toContain('XLM');
    expect(result.healthFactor).toBeNull();
  });

  it('tracks residual bad debt and calculates hfExBadDebt and hfWithBadDebt', () => {
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 50,
        asset: { code: 'XLM', minCollateralRatio: 0.8 },
      },
    ];

    const badDebtUsd = 20; // $20 residual bad debt post-liquidation
    const result = computeHealthFactor(positions, {}, {}, { badDebtUsd });

    expect(result.badDebtUsd).toBe(20);
    expect(result.hfExBadDebt).toBeCloseTo(80 / 50, 6); // 1.6
    expect(result.hfWithBadDebt).toBeCloseTo(80 / (50 + 20), 6); // 80 / 70 = 1.142857
  });

  it('returns Infinity when there is zero borrowed amount', () => {
    const positions = [
      {
        assetId: 'xlm-id',
        assetCode: 'XLM',
        depositedUsd: 100,
        borrowedUsd: 0,
        asset: { code: 'XLM', minCollateralRatio: 0.8 },
      },
    ];

    const result = computeHealthFactor(positions);
    expect(result.healthFactor).toBe(Infinity);
    expect(result.availableToBorrow).toBe(80);
  });
});

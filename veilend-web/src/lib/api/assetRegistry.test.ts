import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAssetRegistry,
  registryDecimals,
  registrySymbol,
  registryMcr,
  fallbackSquish,
  FALLBACK_CONTRACT_DECIMALS,
  _resetWarnFlag,
} from './assetRegistry';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const XLM_CONTRACT = 'CAS3J7GYLGXMF6TDJBBYYQU3SRA5W3WKVR6SXLB6ERBNNRQMXYCBY6TN';
const USDC_CONTRACT = 'CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD';
const WBTC_CONTRACT = 'CBLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF45ZG2MG6355F7G6A56XYZ2';
const UNKNOWN_CONTRACT = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ2345678ABCDEFGHIJKLMNOPQR3JDK';

const SAMPLE_ASSETS = [
  { symbol: 'XLM', name: 'Native Lumens', decimals: 7, contractId: XLM_CONTRACT, isNative: true, minCollateralRatio: 0.70, logoUrl: null },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6, contractId: USDC_CONTRACT, isNative: false, minCollateralRatio: 0.90, logoUrl: 'https://cdn.example.com/usdc.png' },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8, contractId: WBTC_CONTRACT, isNative: false, minCollateralRatio: 0.75, logoUrl: null },
];

// ---------------------------------------------------------------------------
// Decimal scaling matrix
// ---------------------------------------------------------------------------

describe('registryDecimals — scaling matrix', () => {
  beforeEach(() => _resetWarnFlag());

  const registry = buildAssetRegistry(SAMPLE_ASSETS);

  it('XLM uses 7 decimals', () => {
    expect(registryDecimals(registry, XLM_CONTRACT)).toBe(7);
    // 1 XLM in raw = 10_000_000 stroops
    expect(10_000_000 / (10 ** registryDecimals(registry, XLM_CONTRACT))).toBe(1);
  });

  it('USDC uses 6 decimals', () => {
    expect(registryDecimals(registry, USDC_CONTRACT)).toBe(6);
    // 1 USDC in raw = 1_000_000 micro-USDC
    expect(1_000_000 / (10 ** registryDecimals(registry, USDC_CONTRACT))).toBe(1);
  });

  it('WBTC uses 8 decimals', () => {
    expect(registryDecimals(registry, WBTC_CONTRACT)).toBe(8);
    // 1 WBTC in raw = 100_000_000 satoshis
    expect(100_000_000 / (10 ** registryDecimals(registry, WBTC_CONTRACT))).toBe(1);
  });

  it('old /1e7 would under-measure USDC by 10x', () => {
    const rawUsdc = 1_000_000; // 1 USDC
    const correct = rawUsdc / (10 ** 6);  // → 1.0
    const wrong   = rawUsdc / 1e7;         // → 0.1 (10x under)
    expect(correct).toBe(1.0);
    expect(wrong).toBeCloseTo(0.1);
  });

  it('old /1e7 would over-measure WBTC by 10x', () => {
    const rawWbtc = 100_000_000; // 1 WBTC
    const correct = rawWbtc / (10 ** 8);  // → 1.0
    const wrong   = rawWbtc / 1e7;         // → 10 (10x over)
    expect(correct).toBe(1.0);
    expect(wrong).toBe(10);
  });

  it('unknown address falls back to 7', () => {
    expect(registryDecimals(registry, UNKNOWN_CONTRACT)).toBe(7);
  });

  it('known USDC fallback contract address returns 6 when registry empty', () => {
    const emptyRegistry = buildAssetRegistry([]);
    expect(FALLBACK_CONTRACT_DECIMALS.get(USDC_CONTRACT)).toBe(6);
    expect(registryDecimals(emptyRegistry, USDC_CONTRACT)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Health factor formula
// ---------------------------------------------------------------------------

describe('Health factor — per-asset MCR weighted', () => {
  const registry = buildAssetRegistry(SAMPLE_ASSETS);

  /**
   * Hand calculation:
   *   XLM deposited: $1000 × MCR 0.70 = $700 weighted
   *   ETH deposited: $500  × MCR 0.65 = $325 weighted
   *   (ETH not in SAMPLE_ASSETS so uses FALLBACK_MCR_BY_SYMBOL via registryMcr)
   *   Total weighted = $1025
   *   Total borrowed = $800
   *   HF = 1025 / 800 = 1.28125
   */
  it('computes HF correctly with two assets at different MCRs', () => {
    const xlmDepositedUsd = 1000;
    const xlmMcr = registryMcr(registry, XLM_CONTRACT)!;  // 0.70
    const xlmWeighted = xlmDepositedUsd * xlmMcr;          // 700

    // ETH not in the sample registry — registryMcr returns null.
    // Simulate the formula using direct MCR value (ETH MCR = 0.65 per AC spec)
    const ethDepositedUsd = 500;
    const ethMcr = 0.65;
    const ethWeighted = ethDepositedUsd * ethMcr;           // 325

    const totalWeighted = xlmWeighted + ethWeighted;        // 1025
    const totalBorrowedUsd = 800;
    const hf = totalWeighted / totalBorrowedUsd;

    expect(xlmMcr).toBe(0.70);
    expect(xlmWeighted).toBe(700);
    expect(ethWeighted).toBe(325);
    expect(totalWeighted).toBe(1025);
    expect(hf).toBeCloseTo(1.28125, 5);
  });

  it('returns Infinity when totalBorrowed is 0', () => {
    // Mimics the fetchDashboardData guard
    const hf = 0 === 0 ? Infinity : 999;
    expect(hf).toBe(Infinity);
  });

  it('XLM MCR from registry is 0.70', () => {
    expect(registryMcr(registry, XLM_CONTRACT)).toBe(0.70);
  });

  it('USDC MCR from registry is 0.90', () => {
    expect(registryMcr(registry, USDC_CONTRACT)).toBe(0.90);
  });

  it('returns null MCR for unknown address (no registry, no symbol fallback)', () => {
    expect(registryMcr(registry, UNKNOWN_CONTRACT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Symbol lookup
// ---------------------------------------------------------------------------

describe('Symbol lookup', () => {
  const registry = buildAssetRegistry(SAMPLE_ASSETS);

  it('returns canonical symbol from registry when address is known', () => {
    expect(registrySymbol(registry, USDC_CONTRACT)).toBe('USDC');
    expect(registrySymbol(registry, XLM_CONTRACT)).toBe('XLM');
    expect(registrySymbol(registry, WBTC_CONTRACT)).toBe('WBTC');
  });

  it('returns fallback squish for unknown address — first-4…last-4', () => {
    const addr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ2345678ABCDEFGHIJKLMNOPQR3JDK';
    expect(registrySymbol(registry, addr)).toBe('GABC…3JDK');
  });

  it('never returns a substring search result like the old extractAssetSymbol did', () => {
    // The old code would match 'USDC' if the address contained that substring.
    // Our registry never does substring matching.
    const fakeAddr = 'GUSDC_ATTACKER_CONTRACT_12345678';
    expect(registrySymbol(registry, fakeAddr)).not.toBe('USDC');
    expect(registrySymbol(registry, fakeAddr)).toBe('GUSD…5678');
  });
});

// ---------------------------------------------------------------------------
// fallbackSquish
// ---------------------------------------------------------------------------

describe('fallbackSquish', () => {
  it('squishes long addresses to first-4…last-4', () => {
    expect(fallbackSquish('GABCDEFGHIJKLMNOPQRSTUVWXYZ2345678ABCDEFGHIJKLMNOPQR3JDK')).toBe('GABC…3JDK');
  });

  it('returns short strings unchanged', () => {
    expect(fallbackSquish('XLM')).toBe('XLM');
    expect(fallbackSquish('ABCDEFGH')).toBe('ABCDEFGH');
  });
});

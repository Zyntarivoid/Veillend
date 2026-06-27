import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  exceedsPrecision,
  validateAmount,
  ValidationContext,
} from './amount';

const baseCtx: ValidationContext = {
  availableBalance: 1000,
  priceUsd: 1,
  decimals: 7,
};

describe('parseAmount', () => {
  it('parses clean decimals', () => {
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('  100  ')).toBe(100);
    expect(parseAmount('0.0000001')).toBe(0.0000001);
  });

  it('rejects non-numeric and malformed input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1e5')).toBeNull();
  });
});

describe('exceedsPrecision', () => {
  it('accepts values within 7 decimals', () => {
    expect(exceedsPrecision(1.1234567, 7)).toBe(false);
  });
  it('rejects values beyond the asset precision', () => {
    expect(exceedsPrecision(1.12345678, 7)).toBe(true);
  });
});

describe('validateAmount — common guards', () => {
  it('blocks empty / zero / negative', () => {
    expect(validateAmount('DEPOSIT', '', baseCtx).valid).toBe(false);
    expect(validateAmount('DEPOSIT', '0', baseCtx).valid).toBe(false);
    expect(validateAmount('DEPOSIT', '-1', baseCtx).valid).toBe(false);
  });

  it('blocks amounts exceeding precision', () => {
    const r = validateAmount('DEPOSIT', '1.123456789', baseCtx);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/decimal/i);
  });
});

describe('validateAmount — DEPOSIT/WITHDRAW', () => {
  it('blocks amounts above balance', () => {
    const r = validateAmount('DEPOSIT', '1001', baseCtx);
    expect(r.valid).toBe(false);
    expect(r.severity).toBe('error');
  });

  it('warns when using the full balance', () => {
    const r = validateAmount('WITHDRAW', '1000', baseCtx);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('warning');
  });

  it('accepts a normal amount', () => {
    expect(validateAmount('DEPOSIT', '500', baseCtx)).toEqual({ valid: true });
  });
});

describe('validateAmount — BORROW', () => {
  const ctx: ValidationContext = { ...baseCtx, borrowLimitUsd: 100, priceUsd: 1 };

  it('blocks borrowing above the limit', () => {
    const r = validateAmount('BORROW', '101', ctx);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/borrow limit/i);
  });

  it('warns when borrowing near the limit', () => {
    const r = validateAmount('BORROW', '85', ctx);
    expect(r.valid).toBe(true);
    expect(r.severity).toBe('warning');
    expect(r.message).toMatch(/liquidation/i);
  });

  it('accepts a safe borrow', () => {
    expect(validateAmount('BORROW', '50', ctx)).toEqual({ valid: true });
  });
});

describe('validateAmount — REPAY', () => {
  const ctx: ValidationContext = { ...baseCtx, outstandingDebt: 200, availableBalance: 1000 };

  it('blocks repaying more than owed', () => {
    const r = validateAmount('REPAY', '201', ctx);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/owe/i);
  });

  it('blocks repaying more than balance', () => {
    const lowBal: ValidationContext = { ...ctx, outstandingDebt: 5000, availableBalance: 100 };
    const r = validateAmount('REPAY', '150', lowBal);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/balance/i);
  });

  it('accepts a valid partial repay', () => {
    expect(validateAmount('REPAY', '100', ctx)).toEqual({ valid: true });
  });
});

import { describe, expect, it } from 'vitest';
import { rawStroopsToHuman, toSafeBigInt, toSafeNumber } from './coerce';

describe('toSafeNumber', () => {
  it('returns finite numbers', () => {
    expect(toSafeNumber(1.5)).toBe(1.5);
    expect(toSafeNumber('12.5')).toBe(12.5);
    expect(toSafeNumber(0)).toBe(0);
  });

  it('returns null for NaN, Infinity, empty, and non-numeric values', () => {
    expect(toSafeNumber(Number.NaN)).toBeNull();
    expect(toSafeNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toSafeNumber(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(toSafeNumber('abc')).toBeNull();
    expect(toSafeNumber('')).toBeNull();
    expect(toSafeNumber(null)).toBeNull();
    expect(toSafeNumber(undefined)).toBeNull();
  });
});

describe('toSafeBigInt', () => {
  it('parses integer strings and numbers', () => {
    expect(toSafeBigInt('10000000')).toBe(BigInt(10000000));
    expect(toSafeBigInt(0)).toBe(BigInt(0));
    expect(toSafeBigInt(BigInt(42))).toBe(BigInt(42));
  });

  it('rejects non-integers and invalid strings', () => {
    expect(toSafeBigInt('notANumber')).toBeNull();
    expect(toSafeBigInt(1.2)).toBeNull();
    expect(toSafeBigInt(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toSafeBigInt('1e7')).toBeNull();
  });
});

describe('rawStroopsToHuman', () => {
  it('scales stroops by 1e7 without producing NaN', () => {
    expect(rawStroopsToHuman('10000000')).toBe(1);
    expect(rawStroopsToHuman('notANumber')).toBeNull();
  });
});

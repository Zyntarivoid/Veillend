import { describe, expect, it } from 'vitest';

import { requireSafeNumber, toSafeBigInt, toSafeNumber } from './safe-numbers';

describe('safe numeric conversions', () => {
  it('converts integer strings with asset decimals', () => {
    expect(toSafeNumber('1234567', 7, ['positions', 0, 'depositedRaw'])).toBe(0.1234567);
    expect(toSafeBigInt('-42', ['amount'])).toBe(BigInt(-42));
  });

  it.each(['notANumber', '1.2', '', Number.NaN, Number.POSITIVE_INFINITY])(
    'returns null for unsafe integer input %s',
    (value) => {
      expect(toSafeBigInt(value)).toBeNull();
      expect(toSafeNumber(value)).toBeNull();
    },
  );

  it('returns null when decimals or the converted value are unsafe', () => {
    expect(toSafeNumber('1', 400)).toBeNull();
    expect(toSafeNumber(`1${'0'.repeat(400)}`)).toBeNull();
  });

  it('turns a failed required conversion into a path-aware validation error', () => {
    expect(() => requireSafeNumber(`1${'0'.repeat(400)}`, 0, ['transactions', 0, 'amount']))
      .toThrow(expect.objectContaining({
        name: 'ValidationError',
        path: 'transactions.0.amount',
      }));
  });
});

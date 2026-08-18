import { describe, it, expect } from 'vitest';
import { validateActionInput } from './schemas';

describe('ActionInputSchema Zod validation', () => {
  const baseInput = {
    action: 'DEPOSIT',
    userAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    assetSymbol: 'USDC',
    assetAddress: 'CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD',
    amount: 100,
    availableBalance: 500,
    depositedBalance: 0,
    borrowedBalance: 0,
    priceUsd: 1.0,
    decimals: 7,
  };

  it('passes valid deposit input', () => {
    const res = validateActionInput(baseInput);
    expect(res.success).toBe(true);
  });

  it('rejects zero or negative amounts', () => {
    const resZero = validateActionInput({ ...baseInput, amount: 0 });
    expect(resZero.success).toBe(false);

    const resNeg = validateActionInput({ ...baseInput, amount: -10 });
    expect(resNeg.success).toBe(false);
  });

  it('rejects deposit exceeding wallet balance', () => {
    const res = validateActionInput({ ...baseInput, amount: 600, availableBalance: 500 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('exceeds wallet balance');
    }
  });

  it('rejects withdraw exceeding deposited balance', () => {
    const res = validateActionInput({
      ...baseInput,
      action: 'WITHDRAW',
      amount: 200,
      depositedBalance: 100,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('exceeds deposited balance');
    }
  });

  it('rejects borrow exceeding borrow limit in USD', () => {
    const res = validateActionInput({
      ...baseInput,
      action: 'BORROW',
      amount: 150,
      priceUsd: 2.0, // USD = 300
      borrowLimitUsd: 200,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('exceeds borrow limit');
    }
  });

  it('rejects repay exceeding outstanding debt', () => {
    const res = validateActionInput({
      ...baseInput,
      action: 'REPAY',
      amount: 150,
      borrowedBalance: 100,
      availableBalance: 500,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('exceeds outstanding debt');
    }
  });

  it('rejects invalid Stellar user address', () => {
    const res = validateActionInput({
      ...baseInput,
      userAddress: 'INVALID_ADDRESS',
    });
    expect(res.success).toBe(false);
  });
});

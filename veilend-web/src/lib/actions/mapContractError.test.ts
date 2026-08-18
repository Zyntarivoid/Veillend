import { describe, it, expect } from 'vitest';
import { mapContractError } from './mapContractError';

describe('mapContractError', () => {
  it('maps all 17 VeilLendError numeric codes correctly', () => {
    const expectedTitles = [
      'Protocol Already Initialized', // 1
      'Unauthorized Action',          // 2
      'Unsupported Asset',            // 3
      'Invalid Amount',               // 4
      'Insufficient Collateral',      // 5
      'Insufficient Deposit',         // 6
      'Repay Amount Exceeds Debt',    // 7
      'Invalid Collateral Ratio',     // 8
      'Protocol Not Initialized',     // 9
      'Zero Amount',                  // 10
      'Oracle Price Missing',         // 11
      'Contract Paused',              // 12
      'Deposit Cap Exceeded',         // 13
      'Borrow Cap Exceeded',          // 14
      'Invalid Cap Value',            // 15
      'Circuit Breaker Triggered',    // 16
      'Insufficient Pool Reserve',    // 17
    ];

    for (let code = 1; code <= 17; code++) {
      const mapped = mapContractError(code);
      expect(mapped.code).toBe(code);
      expect(mapped.title).toBe(expectedTitles[code - 1]);
      expect(mapped.description).toBeTruthy();
    }
  });

  it('maps contract error names by string', () => {
    const mapped = mapContractError('DepositCapExceeded');
    expect(mapped.code).toBe(13);
    expect(mapped.title).toBe('Deposit Cap Exceeded');

    const paused = mapContractError('ContractPaused');
    expect(paused.code).toBe(12);
    expect(paused.title).toBe('Contract Paused');
  });

  it('parses HostError / panic error strings with numeric hash format', () => {
    const mapped = mapContractError(new Error('HostError: Error(Contract, #5)'));
    expect(mapped.code).toBe(5);
    expect(mapped.title).toBe('Insufficient Collateral');
  });

  it('maps 429 rate limit error', () => {
    const mapped = mapContractError(new Error('429 Too Many Requests'));
    expect(mapped.title).toBe('Rate Limit Exceeded');

    const mappedDirect = mapContractError(429);
    expect(mappedDirect.title).toBe('Rate Limit Exceeded');
  });

  it('maps user cancellation', () => {
    const mapped = mapContractError(new Error('User rejected the transaction'));
    expect(mapped.title).toBe('Transaction Cancelled');
  });

  it('handles null/undefined gracefully', () => {
    expect(mapContractError(null).title).toBe('Unknown Error');
    expect(mapContractError(undefined).title).toBe('Unknown Error');
  });
});

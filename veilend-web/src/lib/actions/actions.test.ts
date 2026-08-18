import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDeposit } from './deposit';
import { executeWithdraw } from './withdraw';
import { executeBorrow } from './borrow';
import { executeRepay } from './repay';
import * as freighter from '@stellar/freighter-api';
import * as simulation from '../stellar/simulation';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
  signTransaction: vi.fn().mockResolvedValue('AAAA_SIGNED_XDR_MOCK'),
}));

vi.mock('../stellar/simulation', () => ({
  simulateSorobanTransaction: vi.fn().mockResolvedValue({
    success: true,
    unsignedXdr: 'AAAA_UNSIGNED_XDR_MOCK',
    panicError: null,
  }),
}));

describe('Action Execution Pipelines', () => {
  const validUser = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const validAsset = 'CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executeDeposit fails Step (a) if validation fails (e.g. amount exceeds balance)', async () => {
    const res = await executeDeposit({
      action: 'DEPOSIT',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 1000,
      availableBalance: 100,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(false);
    expect(res.error?.title).toBe('Validation Error');
    expect(simulation.simulateSorobanTransaction).not.toHaveBeenCalled();
  });

  it('executeDeposit short-circuits at Step (b) if simulation panics', async () => {
    vi.mocked(simulation.simulateSorobanTransaction).mockResolvedValueOnce({
      success: false,
      unsignedXdr: null,
      panicError: {
        title: 'Deposit Cap Exceeded',
        description: 'This asset has reached its maximum protocol deposit cap limit.',
        code: 13,
      },
    });

    const res = await executeDeposit({
      action: 'DEPOSIT',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 50,
      availableBalance: 100,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(false);
    expect(res.error?.title).toBe('Deposit Cap Exceeded');
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });

  it('executeDeposit completes successfully when simulation and signing succeed', async () => {
    const res = await executeDeposit({
      action: 'DEPOSIT',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 50,
      availableBalance: 100,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(true);
    expect(res.txHash).toBeTruthy();
  });

  it('executeWithdraw short-circuits when simulation returns InsufficientDeposit', async () => {
    vi.mocked(simulation.simulateSorobanTransaction).mockResolvedValueOnce({
      success: false,
      unsignedXdr: null,
      panicError: {
        title: 'Insufficient Deposit',
        description: 'Your deposited balance is lower than the requested withdrawal amount.',
        code: 6,
      },
    });

    const res = await executeWithdraw({
      action: 'WITHDRAW',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 50,
      availableBalance: 100,
      depositedBalance: 50,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(false);
    expect(res.error?.title).toBe('Insufficient Deposit');
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });

  it('executeBorrow short-circuits when simulation returns InsufficientCollateral', async () => {
    vi.mocked(simulation.simulateSorobanTransaction).mockResolvedValueOnce({
      success: false,
      unsignedXdr: null,
      panicError: {
        title: 'Insufficient Collateral',
        description: 'Your collateral is insufficient to support this operation.',
        code: 5,
      },
    });

    const res = await executeBorrow({
      action: 'BORROW',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 50,
      availableBalance: 100,
      borrowLimitUsd: 200,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(false);
    expect(res.error?.title).toBe('Insufficient Collateral');
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });

  it('executeRepay completes successfully', async () => {
    const res = await executeRepay({
      action: 'REPAY',
      userAddress: validUser,
      assetSymbol: 'USDC',
      assetAddress: validAsset,
      amount: 25,
      availableBalance: 100,
      borrowedBalance: 50,
      priceUsd: 1.0,
    });

    expect(res.success).toBe(true);
    expect(res.txHash).toBeTruthy();
  });
});

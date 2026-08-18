import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backendFetch } from '@/lib/server/backendFetch';

import { fetchDashboardData } from './dashboard';

vi.mock('@/lib/server/backendFetch', () => ({
  backendFetch: vi.fn(),
}));

const ADDRESS = `G${'A'.repeat(55)}`;
const ASSET = 'asset-usdc';

const responseFor = (path: string): Response => {
  if (path.startsWith('/indexer/positions/')) {
    return Response.json({
      positions: [{ assetAddress: ASSET, deposited: '1000000', borrowed: '0' }],
    });
  }
  if (path.startsWith('/indexer/transactions/')) {
    return Response.json({
      transactions: [
        {
          id: 'tx-1',
          type: 'deposit',
          amount: '1000000',
          assetAddress: ASSET,
          timestamp: '2026-08-17T00:00:00.000Z',
          txHash: 'hash-1',
        },
      ],
    });
  }
  if (path === '/oracle/prices') {
    return Response.json({ prices: { [ASSET]: 1 } });
  }
  return Response.json([
    {
      symbol: 'USDC',
      name: 'USD Coin',
      contractId: ASSET,
      decimals: 6,
      minCollateralRatio: 0.9,
    },
  ]);
};

describe('fetchDashboardData', () => {
  beforeEach(() => {
    vi.mocked(backendFetch).mockReset();
    vi.mocked(backendFetch).mockImplementation(async (path) => responseFor(path));
  });

  it('validates and transforms backend indexer contracts', async () => {
    const result = await fetchDashboardData(ADDRESS);

    expect(result.portfolio.totalDepositedUsd).toBe(1);
    expect(result.recentActivity[0]?.amount).toBe(1);
    expect(backendFetch).toHaveBeenCalledTimes(4);
  });

  it('rejects a non-integer position once with its canonical path', async () => {
    vi.mocked(backendFetch).mockImplementation(async (path) => {
      if (path.startsWith('/indexer/positions/')) {
        return Response.json({
          positions: [{ assetAddress: ASSET, depositedRaw: 'notANumber', borrowedRaw: '0' }],
        });
      }
      return responseFor(path);
    });

    await expect(fetchDashboardData(ADDRESS)).rejects.toMatchObject({
      name: 'ValidationError',
      path: 'positions.0.depositedRaw',
    });
    expect(
      vi.mocked(backendFetch).mock.calls.filter(([path]) =>
        String(path).startsWith('/indexer/positions/'),
      ),
    ).toHaveLength(1);
  });
});

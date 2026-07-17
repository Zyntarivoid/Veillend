import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fetchDashboardData } from '@/lib/api/dashboard';

const fetchMock = vi.fn();

describe('fetchDashboardData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps positions and transactions into dashboard data', async () => {
    const positions = [
      {
        assetAddress: 'USDC-ABC',
        depositedAmount: '10000000',
        borrowedAmount: '5000000',
      },
      {
        assetAddress: 'XLM-XYZ',
        depositedAmount: '20000000',
        borrowedAmount: '0',
      },
    ];

    const transactions = [
      {
        id: '1',
        type: 'deposit',
        amount: '5000000',
        assetAddress: 'USDC-ABC',
        timestamp: '2026-07-16T10:00:00Z',
        txHash: 'hash1',
      },
      {
        id: '2',
        type: 'borrow',
        amount: '10000000',
        assetAddress: 'XLM-XYZ',
        timestamp: '2026-07-16T12:00:00Z',
        txHash: 'hash2',
      },
    ];

    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);

      if (url.includes('/indexer/positions/')) {
        return Promise.resolve(new Response(JSON.stringify({ positions }), { status: 200 }));
      }

      if (url.includes('/indexer/transactions/')) {
        return Promise.resolve(new Response(JSON.stringify({ transactions }), { status: 200 }));
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const dashboard = await fetchDashboardData('GTESTADDRESS');

    expect(dashboard.portfolio.totalDepositedUsd).toBeCloseTo(1.22, 5);
    expect(dashboard.portfolio.totalBorrowedUsd).toBeCloseTo(0.5, 5);
    expect(dashboard.portfolio.totalBalanceUsd).toBeCloseTo(0.72, 5);
    expect(dashboard.portfolio.depositedAssets).toHaveLength(2);
    expect(dashboard.portfolio.borrowedAssets).toHaveLength(1);
    expect(dashboard.recentActivity[0].id).toBe('2');
    expect(dashboard.recentActivity[1].id).toBe('1');
  });

  it('returns a valid dashboard structure when indexer data is empty', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);

      if (url.includes('/indexer/positions/')) {
        return Promise.resolve(new Response(JSON.stringify({ positions: [] }), { status: 200 }));
      }

      if (url.includes('/indexer/transactions/')) {
        return Promise.resolve(new Response(JSON.stringify({ transactions: [] }), { status: 200 }));
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const dashboard = await fetchDashboardData('GEMPTYADDRESS');

    expect(dashboard.portfolio.totalDepositedUsd).toBe(0);
    expect(dashboard.portfolio.totalBorrowedUsd).toBe(0);
    expect(dashboard.portfolio.totalBalanceUsd).toBe(0);
    expect(dashboard.portfolio.healthFactor).toBeCloseTo(99.99, 2);
    expect(dashboard.portfolio.depositedAssets).toHaveLength(0);
    expect(dashboard.portfolio.borrowedAssets).toHaveLength(0);
    expect(dashboard.recentActivity).toHaveLength(0);
  });

  it('throws a helpful error when the indexer returns a failure', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchDashboardData()).rejects.toThrow('Could not load live dashboard data. Is the NestJS indexer running?');
  });
});

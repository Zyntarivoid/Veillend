import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { AssetCardSkeleton, DepositedAssetsCard } from './dashboard-cards';
import type { DashboardData } from '@/lib/types/dashboard';

const TEST_ADDRESS = 'GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';

const mocks = vi.hoisted(() => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('@/lib/api/dashboard', () => ({
  fetchDashboardData: mocks.fetchDashboardData,
}));

const dashboardData: DashboardData = {
  portfolio: {
    totalBalanceUsd: 1234.56,
    healthFactor: 1.5,
    totalDepositedUsd: 2000,
    totalBorrowedUsd: 765.44,
    depositedAssets: [{ assetSymbol: 'USDC', assetName: 'USD Coin', balance: 2000, usdValue: 2000 }],
    borrowedAssets: [],
    lastUpdated: new Date().toISOString(),
    hfBreakdown: [],
  },
  recentActivity: [],
};

describe('Dashboard skeleton streaming perf', () => {
  beforeEach(() => {
    mocks.fetchDashboardData.mockReset();
  });

  it('flushes the skeleton in under 500ms even when one asset card is slow', async () => {
    let resolveFetch: (data: DashboardData) => void;
    const slow = new Promise<DashboardData>((resolve) => {
      resolveFetch = resolve;
    });
    mocks.fetchDashboardData.mockImplementation(() => slow);

    const start = performance.now();
    const stream = await renderToReadableStream(
      <main>
        <header>Dashboard</header>
        <Suspense fallback={<AssetCardSkeleton title="Deposited Assets" />}>
          <DepositedAssetsCard walletAddress={TEST_ADDRESS} />
        </Suspense>
        <footer>End</footer>
      </main>,
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes('Loading deposited assets')) break;
    }
    const skeletonElapsed = performance.now() - start;

    expect(html).toContain('Loading deposited assets');
    expect(skeletonElapsed).toBeLessThan(500);

    resolveFetch!(dashboardData);
    await stream.allReady;

    let tail = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      tail += decoder.decode(value, { stream: true });
    }
    expect(html + tail).toContain('USD Coin');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPortfolioCards } from '@/components/DashboardPortfolioCards';
import { DashboardRetryButton } from '@/components/DashboardRetryButton';
import { UNAVAILABLE_AMOUNT_PLACEHOLDER } from '@/components/AmountDisplay';
import { fetchDashboardData } from './dashboard';
import { ValidationError } from './errors';
import { MAX_FETCH_ATTEMPTS } from './fetch-json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const TEST_ADDRESS = 'GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
const ASSET = 'USDC_CONTRACT';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function mockDashboardFetch(
  impl: (url: string) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => impl(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const validPrices = { prices: { [ASSET]: 1 } };
const emptyTransactions = { transactions: [] };

describe('fetchDashboardData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('(a) happy path returns typed dashboard portfolio data', async () => {
    mockDashboardFetch(async (url) => {
      if (url.includes('/indexer/positions/')) {
        return jsonResponse({
          address: TEST_ADDRESS,
          positions: [{ assetAddress: ASSET, deposited: '10000000', borrowed: '0' }],
        });
      }
      if (url.includes('/indexer/transactions/')) {
        return jsonResponse(emptyTransactions);
      }
      return jsonResponse(validPrices);
    });

    const data = await fetchDashboardData(TEST_ADDRESS, { sleep: async () => undefined });

    expect(data.portfolio.totalDepositedUsd).toBe(1);
    expect(Number.isFinite(data.portfolio.totalDepositedUsd)).toBe(true);
    expect(data.portfolio.depositedAssets[0]?.balance).toBe(1);
    expect(data.recentActivity).toEqual([]);
  });

  it('(b) depositedRaw notANumber throws ValidationError without retry', async () => {
    const fetchMock = mockDashboardFetch(async (url) => {
      if (url.includes('/indexer/positions/')) {
        return jsonResponse({
          positions: [{ assetAddress: ASSET, depositedRaw: 'notANumber' }],
        });
      }
      if (url.includes('/indexer/transactions/')) {
        return jsonResponse(emptyTransactions);
      }
      return jsonResponse(validPrices);
    });

    const error = await fetchDashboardData(TEST_ADDRESS, {
      sleep: async () => undefined,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    if (!(error instanceof ValidationError)) {
      throw new Error('expected ValidationError');
    }
    expect(error.retryable).toBe(false);
    expect(error.path).toContain('depositedRaw');

    const positionCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/indexer/positions/'),
    );
    expect(positionCalls).toHaveLength(1);

    const html = renderToStaticMarkup(<DashboardPortfolioCards portfolio={null} />);
    expect(html).toContain(UNAVAILABLE_AMOUNT_PLACEHOLDER);
    expect(html).toContain('data-testid="amount-slot"');
    expect(html).not.toContain('NaN');
  });

  it('(c) network 500 retries 3x then shows retry CTA', async () => {
    const fetchMock = mockDashboardFetch(async (url) => {
      if (url.includes('/indexer/positions/')) {
        return jsonResponse({ error: 'server' }, 500);
      }
      if (url.includes('/indexer/transactions/')) {
        return jsonResponse(emptyTransactions);
      }
      return jsonResponse(validPrices);
    });

    await expect(
      fetchDashboardData(TEST_ADDRESS, { sleep: async () => undefined }),
    ).rejects.toMatchObject({ name: 'HttpError', retryable: true, status: 500 });

    const positionCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/indexer/positions/'),
    );
    expect(positionCalls).toHaveLength(MAX_FETCH_ATTEMPTS);

    const html = renderToStaticMarkup(<DashboardRetryButton />);
    expect(html).toContain('dashboard-retry');
    expect(html).toContain('Retry');

    await expect(
      fetchDashboardData(TEST_ADDRESS, { sleep: async () => undefined }),
    ).rejects.toMatchObject({ status: 500 });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/indexer/positions/')),
    ).toHaveLength(MAX_FETCH_ATTEMPTS * 2);
  });
});

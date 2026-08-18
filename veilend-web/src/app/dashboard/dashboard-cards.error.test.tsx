import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, ValidationError } from '@/lib/validation/api-schemas';

import { TotalBalanceCard } from './dashboard-cards';

const mocks = vi.hoisted(() => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('@/lib/api/dashboard', () => ({
  fetchDashboardData: mocks.fetchDashboardData,
}));

describe('dashboard API error states', () => {
  beforeEach(() => {
    mocks.fetchDashboardData.mockReset();
  });

  it('keeps the numeric slot and warns without retry CTA for invalid data', async () => {
    mocks.fetchDashboardData.mockRejectedValue(
      new ValidationError('Expected an integer string', [
        'positions',
        0,
        'depositedRaw',
      ]),
    );

    const html = renderToStaticMarkup(
      await TotalBalanceCard({ walletAddress: `G${'A'.repeat(55)}` }),
    );

    expect(html).toContain('—');
    expect(html).toContain('Data validation warning');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Try Again');
  });

  it('offers a retry CTA after retryable failures are exhausted', async () => {
    mocks.fetchDashboardData.mockRejectedValue(new HttpError(500, 'Server Error'));

    const html = renderToStaticMarkup(
      await TotalBalanceCard({ walletAddress: `G${'B'.repeat(55)}` }),
    );

    expect(html).toContain('—');
    expect(html).toContain('Try Again');
  });
});

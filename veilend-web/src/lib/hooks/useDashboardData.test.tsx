// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardData } from '@/lib/types/dashboard';
import { ValidationError } from '@/lib/validation/api-schemas';

import { useDashboardData } from './useDashboardData';

const mocks = vi.hoisted(() => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('../api/dashboard-client', () => ({
  getDashboardClient: () => ({
    fetchDashboardData: mocks.fetchDashboardData,
  }),
}));

const ADDRESS = `G${'A'.repeat(55)}`;
const dashboardData: DashboardData = {
  portfolio: {
    totalBalanceUsd: 1,
    healthFactor: Infinity,
    totalDepositedUsd: 1,
    totalBorrowedUsd: 0,
    depositedAssets: [],
    borrowedAssets: [],
    lastUpdated: '2026-08-17T00:00:00.000Z',
    hfBreakdown: [],
  },
  recentActivity: [],
};

describe('useDashboardData retry ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetchDashboardData.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not add hook retries to a validation failure', async () => {
    mocks.fetchDashboardData.mockRejectedValue(
      new ValidationError('Invalid response', ['positions']),
    );

    renderHook(() =>
      useDashboardData({ address: ADDRESS, refreshInterval: 0 }),
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.fetchDashboardData).toHaveBeenCalledOnce();
  });

  it('preserves the last valid result as stale after a failed refresh', async () => {
    mocks.fetchDashboardData
      .mockResolvedValueOnce(dashboardData)
      .mockRejectedValueOnce(new ValidationError('Invalid response', ['positions']));

    const { result } = renderHook(() =>
      useDashboardData({ address: ADDRESS, refreshInterval: 0 }),
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual(dashboardData);
    expect(result.current.isStale).toBe(true);
  });
});

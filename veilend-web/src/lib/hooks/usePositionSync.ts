'use client'

import * as React from 'react';
import { DashboardData } from '@/lib/types/dashboard';
import { fetchDashboardData } from '@/lib/api/dashboard';

/** Discrete sync states the UI can branch on. */
export type SyncStatus = 'idle' | 'loading' | 'live' | 'stale' | 'empty' | 'error';

export interface PositionSyncState {
  status: SyncStatus;
  data: DashboardData | null;
  /** When the data was last successfully refreshed (ms epoch), null until first load */
  lastSyncedAt: number | null;
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => void;
}

interface UsePositionSyncOptions {
  address?: string;
  /** Poll interval in ms (default 10s, matching the indexer revalidate window) */
  intervalMs?: number;
  /** How long before data is considered stale and flagged in the UI (default 30s) */
  staleAfterMs?: number;
  /** Pause polling (e.g. when the tab is hidden or wallet disconnected) */
  enabled?: boolean;
}

/**
 * Keeps positions, collateral and borrowed values in sync with live protocol
 * state by polling the indexer. Exposes explicit loading / empty / stale / error
 * states so the dashboard can represent each clearly. Privacy mode is orthogonal:
 * this hook only manages the values; masking is handled at render time.
 */
export function usePositionSync(
  options: UsePositionSyncOptions = {},
): PositionSyncState {
  const {
    address,
    intervalMs = 10_000,
    staleAfterMs = 30_000,
    enabled = true,
  } = options;

  const [data, setData] = React.useState<DashboardData | null>(null);
  const [status, setStatus] = React.useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Guards against state updates after unmount / overlapping requests
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);

  const load = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    // Only show the full loading state on the very first fetch; subsequent
    // polls refresh in the background without flickering the UI.
    setStatus((prev) => (prev === 'idle' ? 'loading' : prev));

    try {
      const result = await fetchDashboardData(address);
      if (!mounted.current) return;

      const isEmpty =
        result.portfolio.depositedAssets.length === 0 &&
        result.portfolio.borrowedAssets.length === 0 &&
        result.recentActivity.length === 0;

      setData(result);
      setLastSyncedAt(Date.now());
      setError(null);
      setStatus(isEmpty ? 'empty' : 'live');
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Failed to sync positions.');
      // Keep stale data visible if we have it; otherwise surface the error.
      setStatus((prev) => (data ? 'stale' : 'error'));
    } finally {
      inFlight.current = false;
    }
  }, [address, data]);

  // Initial load + interval polling
  React.useEffect(() => {
    mounted.current = true;
    if (!enabled) return;

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, address]);

  // Independent staleness ticker: flags data as stale if a poll hasn't
  // succeeded within staleAfterMs, even while requests keep failing.
  React.useEffect(() => {
    if (lastSyncedAt === null) return;
    const id = setInterval(() => {
      if (!mounted.current) return;
      setStatus((prev) => {
        if (prev !== 'live' && prev !== 'empty') return prev;
        return Date.now() - lastSyncedAt > staleAfterMs ? 'stale' : prev;
      });
    }, Math.min(staleAfterMs, 5_000));
    return () => clearInterval(id);
  }, [lastSyncedAt, staleAfterMs]);

  return {
    status,
    data,
    lastSyncedAt,
    error,
    refresh: load,
  };
}

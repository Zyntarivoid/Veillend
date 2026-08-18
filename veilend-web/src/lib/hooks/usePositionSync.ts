'use client';

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
 * state by polling the indexer.
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

  // Safely sync ref in useEffect to avoid react-hooks/refs render error
  const dataRef = React.useRef<DashboardData | null>(data);
  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const inFlight = React.useRef<boolean>(false);
  const mounted = React.useRef<boolean>(true);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async () => {
    if (!address || !address.startsWith('G')) {
      setStatus('idle');
      setError('No valid wallet address provided');
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

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

      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to sync positions.';
      setError(errorMessage);

      setStatus(dataRef.current ? 'stale' : 'error');
    } finally {
      inFlight.current = false;
      abortControllerRef.current = null;
    }
  }, [address]);

  // Handle address change: Reset state cleanly
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (address) {
        setStatus('idle');
        setData(null);
        setError(null);
        setLastSyncedAt(null);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [address]);

  const isValid = React.useMemo(() => {
    return Boolean(enabled && address && address.startsWith('G'));
  }, [enabled, address]);

  // Initial load + interval polling
  React.useEffect(() => {
    mounted.current = true;

    if (!isValid) {
      const timer = setTimeout(() => {
        setStatus('idle');
      }, 0);
      return () => clearTimeout(timer);
    }

    const initialTimer = setTimeout(() => {
      if (mounted.current) {
        load();
      }
    }, 0);

    const pollInterval = setInterval(() => {
      if (mounted.current && isValid) {
        load();
      }
    }, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollInterval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isValid, intervalMs, load]);

  // Staleness ticker: flags data as stale if poll hasn't succeeded within staleAfterMs
  React.useEffect(() => {
    if (lastSyncedAt === null) return;

    const ticker = setInterval(() => {
      if (!mounted.current) return;

      setStatus((prev) => {
        if (prev !== 'live' && prev !== 'empty') return prev;

        const isStale = Date.now() - lastSyncedAt > staleAfterMs;
        return isStale ? 'stale' : prev;
      });
    }, Math.min(staleAfterMs, 5_000));

    return () => clearInterval(ticker);
  }, [lastSyncedAt, staleAfterMs]);

  // Component unmount lifecycle
  React.useEffect(() => {
    return () => {
      mounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return {
    status,
    data,
    lastSyncedAt,
    error,
    refresh: load,
  };
}

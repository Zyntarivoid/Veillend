import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardData } from '../types/dashboard';
import { getDashboardClient } from '../api/dashboard-client';

export interface UseDashboardDataOptions {
  address: string | null;
  enabled?: boolean;
  refreshInterval?: number;
  retryOnError?: boolean;
  maxRetries?: number;
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isStale: boolean;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useDashboardData(options: UseDashboardDataOptions): UseDashboardDataResult {
  const {
    address,
    enabled = true,
    refreshInterval = 30000,
    retryOnError = true,
    maxRetries = 3,
  } = options;

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const retryCount = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ref container to hold fetchData reference for safe recursive retry calls
  const fetchDataRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const client = getDashboardClient();

  // Clear pending timers & abort pending requests
  const cleanupPendingOperations = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Primary fetch execution function
  const fetchData = useCallback(async (): Promise<void> => {
    // Validate address format
    if (!address || !address.startsWith('G')) {
      setData(null);
      setIsLoading(false);
      setIsError(true);
      setError(new Error('Invalid wallet address'));
      return;
    }

    cleanupPendingOperations();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setIsError(false);
    setError(null);
    setIsStale(false);

    try {
      const dashboardData = await client.fetchDashboardData(
        address,
        abortControllerRef.current.signal
      );

      setData(dashboardData);
      setLastUpdated(new Date());
      retryCount.current = 0;
      setIsStale(false);
      setIsLoading(false);
    } catch (err) {
      // Ignore request cancellations
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorObj = err instanceof Error ? err : new Error('Failed to fetch dashboard data');
      setError(errorObj);
      setIsError(true);
      setIsLoading(false);

      // Exponential backoff retry logic using ref call to satisfy ESLint
      if (retryOnError && retryCount.current < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount.current), 10000);
        retryCount.current += 1;

        retryTimeoutRef.current = setTimeout(() => {
          if (enabled && address) {
            fetchDataRef.current();
          }
        }, backoffDelay);
      }
    }
  }, [address, client, enabled, maxRetries, retryOnError, cleanupPendingOperations]);

  // Keep fetchDataRef in sync safely via effect
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Separate effect for clearing data when disabled or unmounting
  useEffect(() => {
    if (!enabled || !address) {
      cleanupPendingOperations();
      const timer = setTimeout(() => {
        setData(null);
        setIsLoading(false);
        setIsError(false);
        setError(null);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [enabled, address, cleanupPendingOperations]);

  // Main lifecycle effect: initial fetch + interval polling
  useEffect(() => {
    if (!enabled || !address) {
      return;
    }

    // Deferred execution prevents synchronous setState calls inside the effect
    const initialTimer = setTimeout(() => {
      fetchData();
    }, 0);

    if (refreshInterval > 0) {
      intervalIdRef.current = setInterval(() => {
        setIsStale(true);
        fetchData();
      }, refreshInterval);
    }

    return () => {
      clearTimeout(initialTimer);
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      cleanupPendingOperations();
    };
  }, [address, enabled, refreshInterval, fetchData, cleanupPendingOperations]);

  // Manual refetch trigger
  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled || !address) return;
    retryCount.current = 0;
    await fetchData();
  }, [address, enabled, fetchData]);

  // Handle visibility changes when returning to active tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsStale(true);
      } else if (isStale && enabled && address) {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isStale, enabled, address, fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    isStale,
    refetch,
    lastUpdated,
  };
}

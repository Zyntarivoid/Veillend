import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { useStore } from '../store/store';
import { reportError } from './errorReporting';
import { getRuntimePlatform } from './runtimePlatform';
import ToastComponent from './toast';

const platform = getRuntimePlatform();

const API_URL = platform.OS === 'web' 
  ? 'http://localhost:3000' 
  : 'http://10.0.2.2:3000';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = useStore.getState().authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: capture API errors with structured reporting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Build a structured error report for API failures
    const status = error?.response?.status;
    const url = error?.config?.url;
    const method = error?.config?.method?.toUpperCase();

    // Determine severity based on HTTP status
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (status === 401) severity = 'critical';
    else if (status === 403) severity = 'high';
    else if (status >= 500) severity = 'high';
    else if (!status) severity = 'high'; // Network error (no response)

    // Report to crash instrumentation (PII is auto-scrubbed)
    reportError(error, {
      severity,
      component: 'ApiClient',
      metadata: {
        url,
        method,
        status,
        hasResponse: !!error?.response,
      },
    });

    // Handle 401 - unauthorized session
    if (status === 401) {
      const store = useStore.getState();
      // Prevent multiple logout operations from running concurrently
      if (store.authLoading || store.lendingLoading || store.shieldedLoading) {
        return Promise.reject(error);
      }
      // Fire-and-forget: the interceptor is synchronous at its boundary;
      // logout() attempts backend revocation then clears local state.
      store.logout().catch(() => {});
      ToastComponent.show({
        type: 'error',
        text1: 'Session expired',
        text2: 'Please reconnect your wallet',
      });
    }

    return Promise.reject(error);
  }
);

// ──────────────────────────────────────────────
// Retryable-fetch helper (issue #304)
//
// fetchPortfolio / fetchTransactions are single-shot today: any failure is
// surfaced to the user immediately. This helper classifies failures as
// retryable (network errors, 5xx, 408, 425, 429-with-Retry-After) vs
// non-retryable (auth/validation 4xx) and retries with backoff, honoring
// the Retry-After header when the server sends one.
// ──────────────────────────────────────────────

export type RetryBackoff = 'exponential' | 'linear' | 'fixed';

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoff?: RetryBackoff;
  signal?: AbortSignal;
};

export type RetryDecision =
  | { retry: true; retryAfterMs?: number }
  | { retry: false };

export function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'CanceledError'))
  );
}

function createAbortError(): Error {
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
}

/** Extract a seconds-based retry-after from response headers (RFC 7231). */
export function parseRetryAfter(headers?: Record<string, unknown>): number | null {
  if (!headers) return null;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (raw == null) return null;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) return Math.max(0, Math.floor(numeric));
  const httpDate = Date.parse(String(raw));
  if (!Number.isNaN(httpDate)) {
    return Math.max(0, Math.ceil((httpDate - Date.now()) / 1000));
  }
  return null;
}

/**
 * Classify an axios failure as retryable or not.
 * - network errors (no response) / 5xx / 408 / 425 → retry
 * - 429 → retry ONLY when a Retry-After header is present (honored on wait)
 * - other 4xx (auth / validation) → no retry
 * - aborted requests → no retry
 */
export function getRetryDecision(error: unknown): RetryDecision {
  if (isAbortError(error)) return { retry: false };
  const status = (error as any)?.response?.status as number | undefined;
  if (status == null) return { retry: true };
  if (status === 408 || status === 425 || status >= 500) return { retry: true };
  if (status === 429) {
    const retryAfterMs = parseRetryAfter((error as any)?.response?.headers);
    if (retryAfterMs != null) return { retry: true, retryAfterMs };
    return { retry: false };
  }
  return { retry: false };
}

/** Backoff delay (ms) after a failed attempt, before the next attempt. */
export function getRetryDelayMs(
  attempt: number,
  options: { baseDelayMs: number; backoff: RetryBackoff },
): number {
  const { baseDelayMs, backoff } = options;
  switch (backoff) {
    case 'fixed':
      return baseDelayMs;
    case 'linear':
      return baseDelayMs * attempt;
    default:
      return baseDelayMs * 2 ** (attempt - 1);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * GET with retry + backoff, built on the shared `api` instance so auth
 * headers and the response interceptors keep working.
 */
export async function fetchWithRetry<T = any>(
  url: string,
  options?: AxiosRequestConfig,
  retryOptions: RetryOptions = {},
): Promise<AxiosResponse<T>> {
  const maxAttempts = retryOptions.maxAttempts ?? 3;
  const baseDelayMs = retryOptions.baseDelayMs ?? 300;
  const backoff = retryOptions.backoff ?? 'exponential';
  const { signal } = retryOptions;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await api.get<T>(url, {
        ...(options ?? {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error: any) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const decision = getRetryDecision(error);
      if (!decision.retry || isAbortError(error)) break;
      const delayMs =
        decision.retryAfterMs != null
          ? decision.retryAfterMs * 1000
          : getRetryDelayMs(attempt, { baseDelayMs, backoff });
      await sleep(delayMs, signal);
    }
  }
  throw lastError;
}

export default api;
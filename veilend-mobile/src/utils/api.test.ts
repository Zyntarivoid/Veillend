import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import api, {
  fetchWithRetry,
  getRetryDecision,
  getRetryDelayMs,
  isAbortError,
  parseRetryAfter,
} from './api';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Build an axios-shaped error from an optional HTTP status + headers. */
const axiosError = (status?: number, headers?: Record<string, unknown>) => {
  const error: any = new Error(status ? `HTTP ${status}` : 'Network Error');
  if (status != null) {
    error.response = { status, headers };
  }
  return error;
};

beforeEach(() => {
  (api as any).get = async () => ({ data: {} });
});

// ──────────────────────────────────────────────
// Classification (issue #304)
// ──────────────────────────────────────────────

describe('getRetryDecision (issue #304)', () => {
  it('retries network errors (no response)', () => {
    assert.deepEqual(getRetryDecision(axiosError()), { retry: true });
  });

  it('retries 5xx responses', () => {
    for (const status of [500, 502, 503, 504]) {
      assert.deepEqual(getRetryDecision(axiosError(status)), { retry: true });
    }
  });

  it('retries 408 and 425', () => {
    assert.deepEqual(getRetryDecision(axiosError(408)), { retry: true });
    assert.deepEqual(getRetryDecision(axiosError(425)), { retry: true });
  });

  it('does not retry 429 without a Retry-After header', () => {
    assert.deepEqual(getRetryDecision(axiosError(429)), { retry: false });
  });

  it('retries 429 when Retry-After is present and exposes the delay', () => {
    assert.deepEqual(getRetryDecision(axiosError(429, { 'retry-after': '60' })), {
      retry: true,
      retryAfterMs: 60,
    });
  });

  it('does not retry non-retryable 4xx (auth / validation)', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      assert.deepEqual(getRetryDecision(axiosError(status)), { retry: false });
    }
  });

  it('does not retry aborted requests', () => {
    const error: any = new Error('canceled');
    error.name = 'CanceledError';
    assert.equal(isAbortError(error), true);
    assert.deepEqual(getRetryDecision(error), { retry: false });
  });
});

describe('parseRetryAfter (issue #304)', () => {
  it('parses numeric seconds', () => {
    assert.equal(parseRetryAfter({ 'retry-after': '60' }), 60);
  });

  it('parses the case-insensitive header name', () => {
    assert.equal(parseRetryAfter({ 'Retry-After': '5' }), 5);
  });

  it('returns null when the header is missing', () => {
    assert.equal(parseRetryAfter({}), null);
    assert.equal(parseRetryAfter(undefined), null);
  });

  it('parses an HTTP-date Retry-After into seconds', () => {
    const future = new Date(Date.now() + 90_000);
    const seconds = parseRetryAfter({ 'retry-after': future.toUTCString() });
    assert.ok(seconds != null && seconds >= 85 && seconds <= 95);
  });
});

describe('getRetryDelayMs (issue #304)', () => {
  it('grows exponentially by default', () => {
    const base = { baseDelayMs: 300, backoff: 'exponential' as const };
    assert.equal(getRetryDelayMs(1, base), 300);
    assert.equal(getRetryDelayMs(2, base), 600);
    assert.equal(getRetryDelayMs(3, base), 1200);
  });

  it('supports linear backoff', () => {
    const base = { baseDelayMs: 300, backoff: 'linear' as const };
    assert.equal(getRetryDelayMs(1, base), 300);
    assert.equal(getRetryDelayMs(2, base), 600);
    assert.equal(getRetryDelayMs(3, base), 900);
  });

  it('supports fixed backoff', () => {
    const base = { baseDelayMs: 300, backoff: 'fixed' as const };
    assert.equal(getRetryDelayMs(1, base), 300);
    assert.equal(getRetryDelayMs(5, base), 300);
  });
});

// ──────────────────────────────────────────────
// fetchWithRetry integration
// ──────────────────────────────────────────────

describe('fetchWithRetry (issue #304)', () => {
  it('returns 200 after two 500s with exponential backoff (~900ms+ delay)', async () => {
    let calls = 0;
    (api as any).get = async () => {
      calls += 1;
      if (calls < 3) throw axiosError(500);
      return { data: { ok: true } };
    };

    const started = Date.now();
    const res = await fetchWithRetry('/portfolios/GABC123', undefined, {
      maxAttempts: 3,
      baseDelayMs: 300,
      backoff: 'exponential',
    });
    const elapsed = Date.now() - started;

    assert.equal(calls, 3);
    assert.deepEqual(res.data, { ok: true });
    // 300ms + 600ms = ~900ms of backoff before the successful attempt.
    assert.ok(elapsed >= 850, `expected ~900ms of backoff, got ${elapsed}ms`);
  });

  it('throws immediately on a 403 without retrying', async () => {
    let calls = 0;
    (api as any).get = async () => {
      calls += 1;
      throw axiosError(403);
    };

    const started = Date.now();
    await assert.rejects(() => fetchWithRetry('/portfolios/GABC123', undefined), /HTTP 403/);
    const elapsed = Date.now() - started;

    assert.equal(calls, 1);
    assert.ok(elapsed < 850, 'should not wait for backoff on non-retryable errors');
  });

  it('waits for Retry-After (429) before retrying once', async () => {
    let calls = 0;
    (api as any).get = async () => {
      calls += 1;
      if (calls === 1) throw axiosError(429, { 'retry-after': '1' });
      return { data: { ok: true } };
    };

    const started = Date.now();
    const res = await fetchWithRetry('/portfolios/GABC123', undefined, { maxAttempts: 2 });
    const elapsed = Date.now() - started;

    assert.equal(calls, 2);
    assert.deepEqual(res.data, { ok: true });
    assert.ok(elapsed >= 900, `expected ~1s Retry-After wait, got ${elapsed}ms`);
  });

  it('throws the last error when retries are exhausted', async () => {
    let calls = 0;
    (api as any).get = async () => {
      calls += 1;
      throw axiosError(503);
    };

    await assert.rejects(
      () => fetchWithRetry('/portfolios/GABC123', undefined, { maxAttempts: 3, baseDelayMs: 10 }),
      /HTTP 503/,
    );
    assert.equal(calls, 3);
  });

  it('does not retry after the request is aborted', async () => {
    let calls = 0;
    const controller = new AbortController();
    (api as any).get = async (_url: string, config?: any) => {
      calls += 1;
      // axios rejects aborted requests with a CanceledError before sending.
      if (config?.signal?.aborted) {
        const canceled: any = new Error('canceled');
        canceled.name = 'CanceledError';
        throw canceled;
      }
      throw axiosError(500);
    };

    controller.abort();
    await assert.rejects(
      () => fetchWithRetry('/portfolios/GABC123', undefined, { signal: controller.signal, baseDelayMs: 10 }),
    );
    assert.equal(calls, 1);
  });

  it('honors the AbortSignal during a backoff wait', async () => {
    let calls = 0;
    const controller = new AbortController();
    (api as any).get = async () => {
      calls += 1;
      throw axiosError(500);
    };

    const started = Date.now();
    const promise = fetchWithRetry('/portfolios/GABC123', undefined, {
      signal: controller.signal,
      baseDelayMs: 10_000,
    });
    // Abort while the retry is sleeping: must reject promptly.
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(() => promise, (error: any) => error?.name === 'AbortError');
    assert.ok(Date.now() - started < 5_000, 'abort must interrupt the backoff wait');
    assert.equal(calls, 1);
  });
});

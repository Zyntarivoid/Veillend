import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpError, NetworkError, ValidationError } from './errors';
import { MAX_FETCH_ATTEMPTS, fetchJson } from './fetch-json';

const schema = z.object({ ok: z.literal(true) });

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns typed data on a valid 200 payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: true })),
    );

    const result = await fetchJson('https://api.test/health', schema);
    expect(result).toEqual({ ok: true });
  });

  it('throws ValidationError and does not retry when safeParse fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 'nope' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('https://api.test/health', schema, { sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network 500 errors up to 3 times then throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('https://api.test/health', schema, { sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(HttpError);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_FETCH_ATTEMPTS);
  });

  it('retries offline TypeError then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson('https://api.test/health', schema, {
      sleep: async () => undefined,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry HTTP 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('https://api.test/health', schema, { sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(HttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps fetch failures as NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(
      fetchJson('https://api.test/health', schema, {
        maxAttempts: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

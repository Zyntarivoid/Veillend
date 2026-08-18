import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpError, ValidationError } from '@/lib/validation/api-schemas';

import { fetchValidated } from './validated-fetch';

const schema = z.object({ value: z.string() });

describe('fetchValidated', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a validated payload without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ value: 'ok' }));

    await expect(fetchValidated('https://example.test', schema, { fetcher })).resolves.toEqual({
      value: 'ok',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not retry invalid JSON or invalid response shapes', async () => {
    const invalidJsonFetcher = vi.fn().mockResolvedValue(new Response('{', { status: 200 }));
    const invalidShapeFetcher = vi.fn().mockResolvedValue(Response.json({ value: 1 }));

    await expect(
      fetchValidated('https://example.test', schema, { fetcher: invalidJsonFetcher }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      fetchValidated('https://example.test', schema, { fetcher: invalidShapeFetcher }),
    ).rejects.toMatchObject({ name: 'ValidationError', path: 'value' });
    expect(invalidJsonFetcher).toHaveBeenCalledOnce();
    expect(invalidShapeFetcher).toHaveBeenCalledOnce();
  });

  it('retries 5xx three times with exponential backoff', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    const request = fetchValidated('https://example.test', schema, { fetcher });
    const rejection = expect(request).rejects.toBeInstanceOf(HttpError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('does not retry 4xx or an external abort', async () => {
    const clientErrorFetcher = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const controller = new AbortController();
    controller.abort();
    const abortedFetcher = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );

    await expect(
      fetchValidated('https://example.test', schema, { fetcher: clientErrorFetcher }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      fetchValidated('https://example.test', schema, {
        fetcher: abortedFetcher,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(clientErrorFetcher).toHaveBeenCalledOnce();
    expect(abortedFetcher).toHaveBeenCalledOnce();
  });
});

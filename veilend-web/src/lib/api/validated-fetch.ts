import { z } from 'zod';

import {
  HttpError,
  parseApiResponse,
  ValidationError,
} from '@/lib/validation/api-schemas';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ValidatedFetchOptions {
  fetcher?: Fetcher;
  requestInit?: RequestInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const isRetryableApiError = (error: unknown): boolean => {
  if (error instanceof ValidationError || isAbortError(error)) {
    return false;
  }
  if (error instanceof HttpError) {
    return error.status >= 500;
  }
  return true;
};

const isRetryable = (error: unknown, externalSignal?: AbortSignal): boolean => {
  if (externalSignal?.aborted || error instanceof ValidationError) {
    return false;
  }
  if (isAbortError(error)) {
    return !externalSignal?.aborted;
  }
  return isRetryableApiError(error);
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    throw new ValidationError('Response body is not valid JSON', [], { cause: error });
  }
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const fetchValidated = async <Schema extends z.ZodTypeAny>(
  input: RequestInfo | URL,
  schema: Schema,
  options: ValidatedFetchOptions = {},
): Promise<z.output<Schema>> => {
  const {
    fetcher = fetch,
    requestInit,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    const timeoutController = new AbortController();
    const onExternalAbort = (): void => timeoutController.abort(signal?.reason);
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    if (signal?.aborted) {
      timeoutController.abort(signal.reason);
    }
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const response = await fetcher(input, {
        ...requestInit,
        signal: timeoutController.signal,
      });
      if (!response.ok) {
        throw new HttpError(response.status, response.statusText);
      }
      return parseApiResponse(schema, await readJson(response));
    } catch (error) {
      if (!isRetryable(error, signal) || attempt >= retryDelaysMs.length) {
        throw error;
      }
      await wait(retryDelaysMs[attempt]);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
};

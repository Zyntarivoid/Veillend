import type { z } from 'zod';
import {
  HttpError,
  NetworkError,
  ValidationError,
  isAbortError,
  isRetryableError,
} from './errors';
import { reportError } from './report-error';

export const MAX_FETCH_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 10_000;

export type SleepFn = (ms: number) => Promise<void>;

export type FetchJsonOptions = RequestInit & {
  sleep?: SleepFn;
  maxAttempts?: number;
};

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function backoffDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, MAX_BACKOFF_MS);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; sleep?: SleepFn } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_FETCH_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || !isRetryableError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await sleep(backoffDelay(attempt));
    }
  }

  throw lastError;
}

function toNetworkError(error: unknown): NetworkError {
  if (error instanceof NetworkError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Network request failed';
  return new NetworkError(message);
}

export async function parseJsonWithSchema<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  path: string,
): Promise<z.infer<TSchema>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const error = new ValidationError('Response body is not valid JSON', path);
    reportError(error, `ValidationError at ${path}`);
    throw error;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issuePath = parsed.error.issues[0]?.path.join('.') || path;
    const error = new ValidationError(
      `Invalid response at ${issuePath}`,
      issuePath,
      parsed.error.issues,
    );
    reportError(error, `ValidationError at ${issuePath}`);
    throw error;
  }

  return parsed.data;
}

async function fetchOnce<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw toNetworkError(error);
  }

  if (!response.ok) {
    throw new HttpError(`Request failed (HTTP ${response.status})`, response.status);
  }

  return parseJsonWithSchema(response, schema, url);
}

export async function fetchJson<TSchema extends z.ZodType>(
  url: string,
  schema: TSchema,
  options: FetchJsonOptions = {},
): Promise<z.infer<TSchema>> {
  const { sleep, maxAttempts, ...init } = options;
  return withRetry(() => fetchOnce(url, schema, init), { sleep, maxAttempts });
}

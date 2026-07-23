import { randomUUID } from 'crypto';
import type { Request } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function extractOrGenerateCorrelationId(req: Request): string {
  const incoming =
    headerValue(req.headers[CORRELATION_ID_HEADER]) ??
    headerValue(req.headers[REQUEST_ID_HEADER]);

  if (incoming && UUID_RE.test(incoming)) {
    return incoming;
  }

  return randomUUID();
}

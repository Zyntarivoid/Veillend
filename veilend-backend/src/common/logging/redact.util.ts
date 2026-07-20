const REDACTED = '[REDACTED]';

// Add new sensitive field names here (case-insensitive) as they show up in the codebase.
export const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'authorization',
  'signature',
  'nonce',
  'jwt',
]);

const BEARER_RE = /^Bearer\s+.+$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function redact(value: unknown, depth = 5): unknown {
  if (typeof value === 'string' && BEARER_RE.test(value)) {
    return 'Bearer [REDACTED]';
  }

  if (depth <= 0 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth - 1));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED;
    } else {
      result[key] = redact(val, depth - 1);
    }
  }
  return result;
}

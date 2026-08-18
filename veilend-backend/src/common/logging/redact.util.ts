const REDACTED = '[REDACTED]';

export const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secretkey',
  'apikey',
  'authorization',
  'signature',
  'nonce',
  'jwt',
  'privatekey',
  'seed',
]);


// ── PII / secret regexes ────────────────────────────────────────────

// Stellar public (G) address – keep first 6 / last 4, mask middle
const G_ADDRESS_RE = /\bG[A-Z2-7]{55}\b/g;

// Stellar secret (S) key – fully redact
const S_SECRET_RE = /\bS[A-Z2-7]{55}\b/g;

// JWT: three base64url segments separated by dots (minimal 5-char parts)
const JWT_RE =
  /\b[A-Za-z0-9_-]{5,}\.(?:[A-Za-z0-9_-]{5,})\.(?:[A-Za-z0-9_-]{5,})\b/g;

// Authorization: Bearer <value>
const AUTH_BEARER_RE = /Authorization:\s*Bearer\s+\S+/gi;

// Authorization: <any-value> (catch non-Bearer schemes)
const AUTH_HEADER_RE = /Authorization:\s*.+/gi;

// Signature blobs – hex hash (64-char hex = SHA-256)
const SIGNATURE_HEX_RE = /\b[0-9a-fA-F]{64}\b/g;

/**
 * Apply PII regex redaction to a raw string.
 * This is the LAST line of defence before writing to stdout.
 */
export function redactString(value: string): string {
  let out = value;

  // S-secret keys (fully redact) – must run before G-address since both start with a letter
  out = out.replace(S_SECRET_RE, REDACTED);

  // G-addresses: keep first 6 / last 4
  out = out.replace(G_ADDRESS_RE, (match) => {
    return match.slice(0, 6) + '…' + match.slice(-4);
  });

  // JWTs
  out = out.replace(JWT_RE, REDACTED);

  // Authorization headers – generic first (catches all schemes including Bearer)
  out = out.replace(AUTH_HEADER_RE, 'Authorization: [REDACTED]');
  out = out.replace(AUTH_BEARER_RE, 'Authorization: Bearer [REDACTED]');

  // Signature hex hashes
  out = out.replace(SIGNATURE_HEX_RE, REDACTED);

  return out;
}

// ── Object / deep redaction ─────────────────────────────────────────

const BEARER_RE = /^Bearer\s+.+$/i;

// Stellar G-address regex (56 chars starting with G)
const STELLAR_G_ADDRESS_RE = /\b(G[A-Z0-9]{50,60})\b/g;

// Stellar S-secret seed regex (50-60 chars starting with S)
const STELLAR_S_SECRET_RE = /\b(S[A-Z0-9]{50,60})\b/g;

// JWT pattern (header.payload.signature starting with eyJ)
const JWT_RE =
  /\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+\b/g;

// Bearer token pattern
const BEARER_RE = /Bearer\s+[A-Za-z0-9-._~+/]+=*/gi;

// Raw signature hex (128 hex chars for 64-byte Ed25519 signature)
const HEX_SIGNATURE_RE = /\b([0-9a-fA-F]{128})\b/g;

// Key-value sensitive pairs in logs (e.g. "password: secret123", "apikey=xyz", "seed: ...")
const KV_SENSITIVE_RE =
  /\b(password|token|accesstoken|refreshtoken|secret|secretkey|apikey|authorization|jwt|privatekey|seed)\s*[:=]\s*([^\s,;]+)/gi;

export function redactString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // 1. Redact JWTs first
  let result = str.replace(JWT_RE, '[REDACTED_JWT]');

  // 2. Redact Bearer tokens
  result = result.replace(BEARER_RE, 'Bearer [REDACTED]');

  // 3. Redact Stellar Secret Keys / seeds
  result = result.replace(STELLAR_S_SECRET_RE, '[REDACTED_SECRET_KEY]');

  // 4. Redact key-value sensitive patterns
  result = result.replace(KV_SENSITIVE_RE, '$1: [REDACTED]');

  // 5. Redact 64-byte Ed25519 signature hex blobs
  result = result.replace(HEX_SIGNATURE_RE, '[REDACTED_SIGNATURE]');

  // 6. Mask Stellar G-addresses (keep first 6 and last 4 chars)
  result = result.replace(STELLAR_G_ADDRESS_RE, (match) => {
    return `${match.slice(0, 6)}...${match.slice(-4)}`;
  });

  return result;
}


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
  if (typeof value === 'string') {

    if (BEARER_RE.test(value)) {
      return 'Bearer [REDACTED]';
    }
    // Apply PII regex redaction to all strings

    return redactString(value);
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

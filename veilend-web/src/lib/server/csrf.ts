// Signs/verifies double-submit CSRF cookie values with HMAC-SHA256.
// Uses Web Crypto (not `node:crypto`) so this also runs in the
// Edge middleware runtime.

const CSRF_SECRET = process.env.CSRF_SECRET || 'dev-insecure-csrf-secret-change-me';
const encoder = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(CSRF_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function generateCsrfValue(): string {
  return crypto.randomUUID();
}

// Produces `${value}.${hmac(value)}` — this whole string is stored in
// the (non-HttpOnly, so JS can read it) csrf_token cookie.
export async function signCsrfToken(value: string): Promise<string> {
  const key = await hmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return `${value}.${toHex(signature)}`;
}

export async function verifyCsrfToken(signedToken: string): Promise<boolean> {
  const [value, signature] = signedToken.split('.');
  if (!value || !signature) {
    return false;
  }
  const expected = await signCsrfToken(value);
  return expected === signedToken;
}

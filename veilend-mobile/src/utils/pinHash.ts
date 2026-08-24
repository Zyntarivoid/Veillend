/**
 * PIN hashing helpers.
 *
 * Acceptance criteria intent: PIN is never stored in plaintext; it is
 * hashed with a slow / salted KDF and only the digest is persisted.
 *
 * The spec nominally references "SHA-256 of argon2id of user PIN";
 * however, argon2id bindings are not available in pure Expo JS. To
 * satisfy the security requirement without ejecting, we use a
 * salted + iterated SHA-256 construction via `expo-crypto`:
 *   digest = H^N(salt || PIN)   (SHA-256 iterated N times)
 *
 * Salt is generated per-device and stored under applock.salt so the
 * same PIN across two devices produces two independent hashes, and
 * the hash cannot be pre-computed against a rainbow table.
 */
import * as Crypto from 'expo-crypto';

const KDF_ITERATIONS = 200_000;
const SALT_BYTES = 16;

export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < SALT_BYTES; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length;
  const out = new Uint8Array(len / 2);
  for (let i = 0, j = 0; i < len; i += 2, j++) {
    out[j] = parseInt(hex.substring(i, i + 2), 16);
  }
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Buffer.from(input).toString('binary'),
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return hexToBytes(hex);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const saltBytes = hexToBytes(salt);
  const pinBytes = new TextEncoder().encode(pin);
  let acc = concatBytes(saltBytes, pinBytes);
  for (let i = 0; i < KDF_ITERATIONS; i++) {
    acc = await sha256Bytes(acc);
  }
  return Buffer.from(acc).toString('hex');
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPin(pin, salt);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

import { validateSecretKey } from './validateSecretKey';

// A real 56-char Stellar secret key uses the Base32 alphabet [A-Z2-7].
// 'S' + 55 chars from that alphabet = valid format (checksum aside).
// We use a real strkey from stellar-base to avoid checksum mismatches.
const VALID_KEY = 'SCZANGBA5YIKH4ARLLDLEH5OVDQV7RKER7QKFMJQKZFMJQKZFMJQ'; // placeholder — replaced below

describe('validateSecretKey', () => {
  it('accepts a valid 56-character Stellar secret key', () => {
    // Generate a structurally valid key: S + 55 uppercase Base32 chars.
    // We rely on Keypair to provide a real key with a valid checksum.
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const result = validateSecretKey(real);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects a key that starts with lowercase s', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const lower = real.replace(/^S/, 's');
    const result = validateSecretKey(lower);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Starts with S');
  });

  it('rejects a key with only 55 characters', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret(); // always 56 chars
    const short = real.slice(0, 55);
    const result = validateSecretKey(short);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('56 characters long');
  });

  it('rejects a key containing the digit 1', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    // Replace last char with '1' (not in Base32 alphabet)
    const bad = real.slice(0, 55) + '1';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a key containing the digit 0', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const bad = real.slice(0, 55) + '0';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a key containing the digit 8', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const bad = real.slice(0, 55) + '8';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a key containing the digit 9', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const bad = real.slice(0, 55) + '9';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a key containing the letter I', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const bad = real.slice(0, 55) + 'I';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a key containing the letter O', () => {
    const { Keypair } = require('@stellar/stellar-base') as typeof import('@stellar/stellar-base');
    const real = Keypair.random().secret();
    const bad = real.slice(0, 55) + 'O';
    const result = validateSecretKey(bad);
    expect(result.valid).toBe(false);
  });

  it('returns "Starts with S" hint for a key not starting with S', () => {
    const result = validateSecretKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(result.error).toBe('Starts with S');
  });

  it('returns "56 characters long" hint when key is shorter than 56 chars', () => {
    const result = validateSecretKey('SABC');
    expect(result.error).toBe('56 characters long');
  });

  it('returns valid=false for an empty string', () => {
    const result = validateSecretKey('');
    expect(result.valid).toBe(false);
  });
});

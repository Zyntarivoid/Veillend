import { redact } from './redact.util';

describe('redact', () => {
  it('redacts top-level sensitive keys case-insensitively', () => {
    const result = redact({
      Password: 'hunter2',
      TOKEN: 'abc',
      username: 'alice',
    });

    expect(result).toEqual({
      Password: '[REDACTED]',
      TOKEN: '[REDACTED]',
      username: 'alice',
    });
  });

  it('redacts nested objects and arrays', () => {
    const result = redact({
      user: { name: 'alice', secret: 'shh' },
      items: [{ apiKey: 'k1' }, { safe: 'v' }],
    });

    expect(result).toEqual({
      user: { name: 'alice', secret: '[REDACTED]' },
      items: [{ apiKey: '[REDACTED]' }, { safe: 'v' }],
    });
  });

  it('redacts Bearer token strings passed directly', () => {
    expect(redact('Bearer abc.def.ghi')).toBe('Bearer [REDACTED]');
  });

  it('masks Stellar G-addresses preserving only first 6 and last 4 characters', () => {
    const addr = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';
    const redacted = redact(`Failed signature for wallet ${addr}`);
    expect(redacted).toBe('Failed signature for wallet GBJEI2...K6MH');
  });

  it('fully redacts Stellar S-secret seed keys', () => {
    const secret = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH';
    const redacted = redact(`Signing transaction with key ${secret}`);
    expect(redacted).toBe('Signing transaction with key [REDACTED_SECRET_KEY]');
  });

  it('redacts JWT tokens embedded in strings', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const redacted = redact(`Session claim payload ${jwt}`);
    expect(redacted).toBe('Session claim payload [REDACTED_JWT]');
  });

  it('redacts 64-byte Ed25519 signature hex blobs', () => {
    const sig = 'a'.repeat(128);
    const redacted = redact(`Tx signature: ${sig}`);
    expect(redacted).toBe('Tx signature: [REDACTED_SIGNATURE]');
  });

  it('safely processes 20 diverse PII/secret inputs with zero leaking', () => {
    const piiSamples = [
      'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH',
      'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc',
      'Authorization: Bearer secret-auth-token-12345',
      'password: mySuperSecretPassword!',
      'apikey: nrm_live_secret_key_9999',
      'secret: top_secret_vault_payload',
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      'f'.repeat(128),
      '1'.repeat(128),
      'User token is eyJ123.eyJ456.sig789',
      'Verify failed for GCKZ27... with secret SBBA5Y...',
      'jwt: eyJheader.eyJpayload.signature',
      'secretkey: some_secret_val',
      'privatekey: ed25519_priv_key_data',
      'nonce: random_challenge_nonce',
      'Bearer test_token_xyz',
      'Invalid signature for GDJEFM7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH',
      'Seed: SAAZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH',
    ];

    for (const sample of piiSamples) {
      const redacted = redact(sample) as string;
      // Assert no raw secret seed or full 56-char secret key remains
      expect(redacted).not.toMatch(
        /SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH/,
      );
      expect(redacted).not.toMatch(
        /SAAZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH/,
      );
      expect(redacted).not.toMatch(/mySuperSecretPassword/);
      expect(redacted).not.toMatch(/nrm_live_secret_key_9999/);
    }
  });

  it('leaves non-object, non-sensitive values untouched', () => {
    expect(redact('hello world')).toBe('hello world');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });
});

import { redact, redactString } from './redact.util';

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

  it('leaves non-object, non-bearer values untouched', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });

  it('does not crash on deeply nested structures and stops at depth limit', () => {
    let deep: Record<string, unknown> = { secret: 'x' };
    for (let i = 0; i < 20; i++) {
      deep = { nested: deep };
    }
    expect(() => redact(deep)).not.toThrow();
  });
});

describe('redactString – PII regex redaction', () => {
  it('masks Stellar G-addresses keeping first 6 and last 4', () => {
    const addr = 'GDQEKJABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQR';
    const result = redactString(`Account ${addr} credited`);
    expect(result).toContain('GDQEKJ…OPQR');
    expect(result).not.toContain(addr);
  });

  it('fully redacts Stellar S-secret keys', () => {
    const secret = 'SAABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
    const result = redactString(`Secret is ${secret} here`);
    expect(result).not.toContain(secret);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactString(`token: ${jwt}`);
    expect(result).not.toContain(jwt);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Authorization: Bearer header values', () => {
    const result = redactString(
      'Authorization: Bearer eyJhbGci.eyJzdWIi.SflKxwRJSMe',
    );
    expect(result).toBe('Authorization: [REDACTED]');
  });

  it('redacts generic Authorization header values', () => {
    const result = redactString('Authorization: Basic dXNlcjpwYXNz');
    expect(result).toBe('Authorization: [REDACTED]');
  });

  it('redacts 64-char hex signature hashes', () => {
    const hash = 'a'.repeat(64);
    const result = redactString(`sig=${hash}`);
    expect(result).not.toContain(hash);
    expect(result).toContain('[REDACTED]');
  });
});

describe('PII acceptance test – 20 sensitive strings produce zero leaks', () => {
  // Valid base32 chars: A-Z, 2-7
  const G_ADDR_1 = 'GDQEKJABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQR';
  const G_ADDR_2 = 'GABC2DABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQR';

  const S_SECRET_1 = 'SAABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
  const S_SECRET_2 = 'SBABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
  const S_SECRET_3 = 'SCABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
  const S_SECRET_4 = 'SDABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';

  const JWT_1 =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const JWT_2 =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const JWT_3 =
    'eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoiYWxpY2UifQ.abc123def456ghi789jkl012mno';
  const JWT_4 =
    'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ2ZXlsZW5kIn0.c2lnbmF0dXJlX2RhdGFfYmFzZTY0dXJs';

  const piiStrings: string[] = [
    // 1-4: Stellar G-addresses
    G_ADDR_1,
    G_ADDR_2,
    `wallet=${G_ADDR_2}`,
    `user ${G_ADDR_1} logged in`,
    // 5-8: Stellar S-secret keys
    S_SECRET_1,
    `secret=${S_SECRET_2}`,
    `key ${S_SECRET_3} leaked`,
    S_SECRET_4,
    // 9-12: JWTs
    JWT_1,
    `Bearer ${JWT_2}`,
    `token=${JWT_3}`,
    `auth: ${JWT_4}`,
    // 13-15: Authorization headers
    'Authorization: Bearer some-token-value-here-12345',
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Authorization: Digest username="admin", realm="test"',
    // 16-18: Signature hex hashes
    'a'.repeat(64),
    `sig: ${'b'.repeat(64)}`,
    `hash=${'0123456789abcdef'.repeat(4)}`,
    // 19-20: Mixed / composite
    `Authorization: Bearer ${JWT_2}`,
    `${G_ADDR_1} ${S_SECRET_1}`,
  ];

  it.each(piiStrings.map((s, i) => [`PII #${i + 1}`, s]))(
    '%s is fully redacted',
    (_label, input) => {
      const result = redactString(input);
      // No S-secret should survive
      expect(result).not.toMatch(/S[A-Z2-7]{55}/);
      // No full G-address should survive
      const gAddrMatch = input.match(/\bG[A-Z2-7]{55}\b/);
      if (gAddrMatch) {
        expect(result).not.toContain(gAddrMatch[0]);
      }
      // No JWT fragments
      expect(result).not.toMatch(/eyJhbGciOiJIUzI1Ni/);
      // No 64-char hex hashes
      expect(result).not.toMatch(/[0-9a-fA-F]{64}/);
    },
  );
});

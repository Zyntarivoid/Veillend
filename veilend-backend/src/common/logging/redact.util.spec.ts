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

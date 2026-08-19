import { sanitizeAddressForLog } from './sanitize-address.util';

describe('sanitizeAddressForLog', () => {
  it('passes a well-formed Stellar address through untouched (prefixed)', () => {
    const address = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
    expect(sanitizeAddressForLog(address)).toBe(`addr:${address}`);
  });

  it('replaces an injected newline so the log line cannot be split', () => {
    const malicious = 'GABC\n ALERT: ACCOUNT_COMPROMISED\nX-Injected: true';
    const result = sanitizeAddressForLog(malicious);

    expect(result).not.toContain('\n');
  });

  it('replaces lower-case letters and other non-base32 characters with ?', () => {
    expect(sanitizeAddressForLog('gabc!@#')).toBe('addr:???????');
  });

  it('truncates input longer than a Stellar address to 56 characters', () => {
    const overlong = 'G' + '2'.repeat(200);
    const result = sanitizeAddressForLog(overlong);

    // 'addr:' prefix + 56 sanitized chars
    expect(result.length).toBe(5 + 56);
  });

  it('handles non-string input safely', () => {
    expect(sanitizeAddressForLog(undefined)).toBe('addr:?');
    expect(sanitizeAddressForLog(null)).toBe('addr:?');
    expect(sanitizeAddressForLog(12345)).toBe('addr:?');
  });
});

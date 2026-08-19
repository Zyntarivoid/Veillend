// Defense-in-depth log sanitizer for Stellar addresses (and address-shaped
// strings in general). Route params are validated with `IsStellarAddress`
// before a handler ever runs, so a well-formed request can't smuggle control
// characters into a log line — but this sanitizer guards any code path that
// logs an address before (or without) that validation, e.g. diagnostic logs
// on the rejected-request branch itself.
//
// Truncates to the Stellar address length and swaps every character outside
// the base32 alphabet (`[A-Z2-7]`) — including newlines, which are what make
// log-injection possible — for `?`, then prefixes the result so sanitized
// output is unambiguous in log lines even when the input was garbage.
const STELLAR_ADDRESS_LENGTH = 56;
const NON_BASE32_CHAR_RE = /[^A-Z2-7]/g;

export function sanitizeAddressForLog(address: unknown): string {
  if (typeof address !== 'string' || address.length === 0) {
    return 'addr:?';
  }

  const truncated = address.slice(0, STELLAR_ADDRESS_LENGTH);
  const sanitized = truncated.replace(NON_BASE32_CHAR_RE, '?');
  return `addr:${sanitized}`;
}

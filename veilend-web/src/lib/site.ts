const LOCAL_SITE_URL = 'http://localhost:3000';

export const SITE_NAME = 'VeilLend';
export const SITE_TITLE = 'VeilLend | Private Liquidity on Stellar';
export const SITE_DESCRIPTION =
  'Privacy-first lending and borrowing on Stellar, powered by Soroban smart contracts.';

/**
 * Deliberately reads `process.env.NEXT_PUBLIC_SITE_URL` statically rather than
 * going through `getConfig()`: that validator looks env vars up with a dynamic
 * key, which Next cannot inline into the client bundle, and this module's
 * `SITE_*` exports are reachable from client components. Routing through it
 * would silently resolve to the default in the browser.
 *
 * `validateConfig()` now gates the same variable at build time, so the catch
 * below is unreachable in practice — it stays as runtime defence only.
 */
export function getSiteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || LOCAL_SITE_URL);
  } catch {
    return new URL(LOCAL_SITE_URL);
  }
}

export function getAbsoluteUrl(path = '/'): string {
  return new URL(path, getSiteUrl()).toString();
}

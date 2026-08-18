const LOCAL_SITE_URL = 'http://localhost:3000';

export const SITE_NAME = 'VeilLend';
export const SITE_TITLE = 'VeilLend | Private Liquidity on Stellar';
export const SITE_DESCRIPTION =
  'Privacy-first lending and borrowing on Stellar, powered by Soroban smart contracts.';

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

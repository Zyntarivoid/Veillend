export function shortenAddress(address: string, start = 6, end = 4): string {
  if (!address) return '';
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? '$';
}

// Ionicons fallback per known asset symbol. Screens prefer asset.logoUrl when
// the backend provides one.
const ASSET_ICONS: Record<string, string> = {
  XLM: 'star',
  USDC: 'logo-usd',
  BLND: 'layers',
  BTC: 'logo-bitcoin',
  ETH: 'logo-ethereum',
  EURT: 'logo-euro',
};

export function getAssetIcon(symbol: string): string {
  return ASSET_ICONS[symbol?.toUpperCase()] ?? 'cube-outline';
}

export type UsernameValidationResult = { valid: true } | { valid: false; error: string };

const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 32;
// Unicode letters/numbers plus space, hyphen, underscore, apostrophe — nothing else.
const USERNAME_PATTERN = /^[\p{L}\p{N} '_-]+$/u;

/**
 * Validates a username against length and character-set rules. The caller
 * is responsible for trimming before persisting; this only validates the
 * trimmed form so callers see consistent length/charset feedback.
 */
export function validateUsername(name: string): UsernameValidationResult {
  const trimmed = name.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.`,
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Only letters, numbers, spaces, hyphens, underscores, and apostrophes are allowed.',
    };
  }

  return { valid: true };
}

/**
 * Derives a lowercase file extension (no leading dot) for a picked image,
 * preferring the picker-reported MIME type over sniffing the URI.
 */
export function getImageExtension(uri: string, mimeType?: string | null): string {
  const fromMime = mimeType?.split('/')[1];
  if (fromMime) return fromMime.toLowerCase();

  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

export interface ValidatedEnvironment {
  PORT: number;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  AUTH_THROTTLE_TTL: number;
  AUTH_THROTTLE_LIMIT: number;
  JWT_SECRET: string;
  STELLAR_HORIZON_URL: string;
  STELLAR_SOROBAN_RPC_URL: string;
  STELLAR_NETWORK_PASSPHRASE: string;
  STELLAR_CONTRACT_ID: string;
  STELLAR_INDEXER_START_LEDGER: number;
  STELLAR_INDEXER_POLL_INTERVAL_MS: number;
}

const DEFAULTS = {
  PORT: 3000,
  THROTTLE_TTL: 60_000,
  THROTTLE_LIMIT: 100,
  AUTH_THROTTLE_TTL: 60_000,
  AUTH_THROTTLE_LIMIT: 5,
  JWT_SECRET: 'development-only-jwt-secret',
  STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  STELLAR_CONTRACT_ID:
    'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
  STELLAR_INDEXER_START_LEDGER: 1,
  STELLAR_INDEXER_POLL_INTERVAL_MS: 5_000,
};

export function validateEnvironment(
  rawConfig: Record<string, unknown>,
): ValidatedEnvironment {
  const errors: string[] = [];
  const config: ValidatedEnvironment = {
    PORT: readPositiveInteger(rawConfig, 'PORT', DEFAULTS.PORT, errors),
    THROTTLE_TTL: readPositiveInteger(
      rawConfig,
      'THROTTLE_TTL',
      DEFAULTS.THROTTLE_TTL,
      errors,
    ),
    THROTTLE_LIMIT: readPositiveInteger(
      rawConfig,
      'THROTTLE_LIMIT',
      DEFAULTS.THROTTLE_LIMIT,
      errors,
    ),
    AUTH_THROTTLE_TTL: readPositiveInteger(
      rawConfig,
      'AUTH_THROTTLE_TTL',
      DEFAULTS.AUTH_THROTTLE_TTL,
      errors,
    ),
    AUTH_THROTTLE_LIMIT: readPositiveInteger(
      rawConfig,
      'AUTH_THROTTLE_LIMIT',
      DEFAULTS.AUTH_THROTTLE_LIMIT,
      errors,
    ),
    JWT_SECRET: readSecret(rawConfig, 'JWT_SECRET', errors),
    STELLAR_HORIZON_URL: readUrl(
      rawConfig,
      'STELLAR_HORIZON_URL',
      DEFAULTS.STELLAR_HORIZON_URL,
      errors,
    ),
    STELLAR_SOROBAN_RPC_URL: readUrl(
      rawConfig,
      'STELLAR_SOROBAN_RPC_URL',
      DEFAULTS.STELLAR_SOROBAN_RPC_URL,
      errors,
    ),
    STELLAR_NETWORK_PASSPHRASE: readNonEmptyString(
      rawConfig,
      'STELLAR_NETWORK_PASSPHRASE',
      DEFAULTS.STELLAR_NETWORK_PASSPHRASE,
      errors,
    ),
    STELLAR_CONTRACT_ID: readNonEmptyString(
      rawConfig,
      'STELLAR_CONTRACT_ID',
      DEFAULTS.STELLAR_CONTRACT_ID,
      errors,
    ),
    STELLAR_INDEXER_START_LEDGER: readPositiveInteger(
      rawConfig,
      'STELLAR_INDEXER_START_LEDGER',
      DEFAULTS.STELLAR_INDEXER_START_LEDGER,
      errors,
    ),
    STELLAR_INDEXER_POLL_INTERVAL_MS: readPositiveInteger(
      rawConfig,
      'STELLAR_INDEXER_POLL_INTERVAL_MS',
      DEFAULTS.STELLAR_INDEXER_POLL_INTERVAL_MS,
      errors,
    ),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return config;
}

export function getSafeRuntimeConfig(config: ValidatedEnvironment) {
  const safeConfig: Partial<ValidatedEnvironment> = { ...config };
  delete safeConfig.JWT_SECRET;

  return safeConfig as Omit<ValidatedEnvironment, 'JWT_SECRET'>;
}

function readPositiveInteger(
  rawConfig: Record<string, unknown>,
  key: keyof ValidatedEnvironment,
  fallback: number,
  errors: string[],
): number {
  const rawValue = rawConfig[key] ?? fallback;
  const value =
    typeof rawValue === 'number'
      ? rawValue
      : Number.parseInt(toConfigString(rawValue), 10);

  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${key} must be a positive integer`);
    return fallback;
  }

  return value;
}

function readUrl(
  rawConfig: Record<string, unknown>,
  key: keyof ValidatedEnvironment,
  fallback: string,
  errors: string[],
): string {
  const value = readNonEmptyString(rawConfig, key, fallback, errors);

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push(`${key} must use http or https`);
    }
  } catch {
    errors.push(`${key} must be a valid URL`);
  }

  return value;
}

function readSecret(
  rawConfig: Record<string, unknown>,
  key: keyof ValidatedEnvironment,
  errors: string[],
): string {
  const hasExplicitSecret = Boolean(toConfigString(rawConfig[key]).trim());
  if (rawConfig.NODE_ENV === 'production' && !hasExplicitSecret) {
    errors.push(`${key} is required in production`);
  }

  const value = readNonEmptyString(rawConfig, key, DEFAULTS.JWT_SECRET, errors);

  if (value.length < 16) {
    errors.push(`${key} must be at least 16 characters`);
  }

  return value;
}

function readNonEmptyString(
  rawConfig: Record<string, unknown>,
  key: keyof ValidatedEnvironment,
  fallback: string,
  errors: string[],
): string {
  const rawValue = rawConfig[key] ?? fallback;
  const value = toConfigString(rawValue).trim();

  if (!value) {
    errors.push(`${key} must not be empty`);
    return fallback;
  }

  return value;
}

function toConfigString(rawValue: unknown): string {
  if (
    typeof rawValue === 'string' ||
    typeof rawValue === 'number' ||
    typeof rawValue === 'boolean'
  ) {
    return String(rawValue);
  }

  return '';
}

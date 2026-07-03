const DEFAULT_STELLAR_CONTRACT_ID =
  'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ';
const DEFAULT_STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEFAULT_STELLAR_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const SENSITIVE_KEYS = new Set(['JWT_SECRET']);

type NodeEnv = 'development' | 'test' | 'production';
type StellarNetwork = 'testnet' | 'public' | 'futurenet' | 'standalone';

export interface ValidatedEnvironment {
  NODE_ENV: NodeEnv;
  PORT: number;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  AUTH_THROTTLE_TTL: number;
  AUTH_THROTTLE_LIMIT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  STELLAR_NETWORK: StellarNetwork;
  STELLAR_HORIZON_URL: string;
  STELLAR_SOROBAN_RPC_URL: string;
  STELLAR_NETWORK_PASSPHRASE: string;
  STELLAR_CONTRACT_ID: string;
  STELLAR_INDEXER_START_LEDGER: number;
  STELLAR_INDEXER_POLL_INTERVAL_MS: number;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): ValidatedEnvironment & Record<string, unknown> {
  const errors: string[] = [];
  const nodeEnv = readEnum<NodeEnv>(
    config,
    'NODE_ENV',
    ['development', 'test', 'production'],
    'development',
    errors,
  );
  const jwtSecret = readString(config, 'JWT_SECRET', 'SUPER_SECRET', errors);

  if (nodeEnv === 'production' && !hasValue(config.JWT_SECRET)) {
    errors.push('JWT_SECRET is required when NODE_ENV is production');
  }

  if (nodeEnv === 'production' && jwtSecret.length < 16) {
    errors.push('JWT_SECRET must be at least 16 characters in production');
  }

  const validated: ValidatedEnvironment = {
    NODE_ENV: nodeEnv,
    PORT: readPositiveInteger(config, 'PORT', 3000, errors),
    THROTTLE_TTL: readPositiveInteger(config, 'THROTTLE_TTL', 60000, errors),
    THROTTLE_LIMIT: readPositiveInteger(config, 'THROTTLE_LIMIT', 100, errors),
    AUTH_THROTTLE_TTL: readPositiveInteger(
      config,
      'AUTH_THROTTLE_TTL',
      60000,
      errors,
    ),
    AUTH_THROTTLE_LIMIT: readPositiveInteger(
      config,
      'AUTH_THROTTLE_LIMIT',
      5,
      errors,
    ),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: readString(config, 'JWT_EXPIRES_IN', '7d', errors),
    STELLAR_NETWORK: readEnum<StellarNetwork>(
      config,
      'STELLAR_NETWORK',
      ['testnet', 'public', 'futurenet', 'standalone'],
      'testnet',
      errors,
    ),
    STELLAR_HORIZON_URL: readHttpUrl(
      config,
      'STELLAR_HORIZON_URL',
      DEFAULT_STELLAR_HORIZON_URL,
      errors,
    ),
    STELLAR_SOROBAN_RPC_URL: readHttpUrl(
      config,
      'STELLAR_SOROBAN_RPC_URL',
      DEFAULT_STELLAR_SOROBAN_RPC_URL,
      errors,
    ),
    STELLAR_NETWORK_PASSPHRASE: readString(
      config,
      'STELLAR_NETWORK_PASSPHRASE',
      DEFAULT_STELLAR_NETWORK_PASSPHRASE,
      errors,
    ),
    STELLAR_CONTRACT_ID: readString(
      config,
      'STELLAR_CONTRACT_ID',
      DEFAULT_STELLAR_CONTRACT_ID,
      errors,
    ),
    STELLAR_INDEXER_START_LEDGER: readPositiveInteger(
      config,
      'STELLAR_INDEXER_START_LEDGER',
      1,
      errors,
    ),
    STELLAR_INDEXER_POLL_INTERVAL_MS: readPositiveInteger(
      config,
      'STELLAR_INDEXER_POLL_INTERVAL_MS',
      5000,
      errors,
    ),
  };

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    ...config,
    ...validated,
  };
}

export function redactSensitiveConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[redacted]' : value,
    ]),
  );
}

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
  errors: string[],
): string {
  const rawValue = config[key];
  if (!hasValue(rawValue)) {
    return fallback;
  }

  const value = String(rawValue).trim();
  if (!value) {
    errors.push(`${key} must not be empty`);
    return fallback;
  }

  return value;
}

function readPositiveInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  errors: string[],
): number {
  const rawValue = config[key];
  if (!hasValue(rawValue)) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${key} must be a positive integer`);
    return fallback;
  }

  return value;
}

function readHttpUrl(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
  errors: string[],
): string {
  const value = readString(config, key, fallback, errors);

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${key} must use http or https`);
    }
  } catch {
    errors.push(`${key} must be a valid URL`);
  }

  return value;
}

function readEnum<T extends string>(
  config: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[],
  fallback: T,
  errors: string[],
): T {
  const rawValue = config[key];
  if (!hasValue(rawValue)) {
    return fallback;
  }

  const value = String(rawValue).trim();
  if (!allowedValues.includes(value as T)) {
    errors.push(`${key} must be one of ${allowedValues.join(', ')}`);
    return fallback;
  }

  return value as T;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return true;
}

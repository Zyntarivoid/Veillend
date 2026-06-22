import {
  DEFAULT_RUNTIME_CONFIG,
  RuntimeConfig,
  SENSITIVE_RUNTIME_CONFIG_KEYS,
} from './runtime-config';

export class EnvironmentValidationError extends Error {
  constructor(messages: string[]) {
    super(`Invalid runtime configuration:\n- ${messages.join('\n- ')}`);
    this.name = EnvironmentValidationError.name;
  }
}

type RawEnvironment = Record<string, unknown>;

type ValidationResult<T> = {
  value?: T;
  error?: string;
};

function readString(
  env: RawEnvironment,
  key: string,
  defaultValue?: string,
): ValidationResult<string> {
  const raw = env[key];
  if (raw === undefined || raw === null || raw === '') {
    if (defaultValue !== undefined) {
      return { value: defaultValue };
    }
    return { error: `${key} is required` };
  }

  return { value: String(raw) };
}

function readInteger(
  env: RawEnvironment,
  key: string,
  defaultValue: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): ValidationResult<number> {
  const raw = env[key] ?? defaultValue;
  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${key} must be an integer between ${min} and ${max}` };
  }

  return { value };
}

function readUrl(
  env: RawEnvironment,
  key: string,
  defaultValue: string,
): ValidationResult<string> {
  const result = readString(env, key, defaultValue);
  if (result.error || result.value === undefined) {
    return result;
  }

  try {
    const url = new URL(result.value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { error: `${key} must use http or https` };
    }
    return { value: url.toString().replace(/\/$/, '') };
  } catch {
    return { error: `${key} must be a valid URL` };
  }
}

function readJwtSecret(env: RawEnvironment, nodeEnv: string): ValidationResult<string> {
  const defaultValue =
    nodeEnv === 'production' ? undefined : DEFAULT_RUNTIME_CONFIG.auth.jwtSecret;
  const result = readString(env, 'JWT_SECRET', defaultValue);
  if (result.error || result.value === undefined) {
    return result;
  }

  if (result.value.length < 32) {
    return { error: 'JWT_SECRET must be at least 32 characters long' };
  }

  if (nodeEnv === 'production' && result.value === DEFAULT_RUNTIME_CONFIG.auth.jwtSecret) {
    return { error: 'JWT_SECRET must be set to a non-default value in production' };
  }

  return result;
}

function collect<T>(
  errors: string[],
  result: ValidationResult<T>,
  fallback: T,
): T {
  if (result.error) {
    errors.push(result.error);
    return fallback;
  }

  return result.value ?? fallback;
}

export function validateEnvironment(env: RawEnvironment): RawEnvironment {
  const errors: string[] = [];
  const nodeEnv = collect(
    errors,
    readString(env, 'NODE_ENV', DEFAULT_RUNTIME_CONFIG.nodeEnv),
    DEFAULT_RUNTIME_CONFIG.nodeEnv,
  ) as RuntimeConfig['nodeEnv'];

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be one of development, test, or production');
  }

  const runtimeConfig: RuntimeConfig = {
    nodeEnv,
    port: collect(
      errors,
      readInteger(env, 'PORT', DEFAULT_RUNTIME_CONFIG.port, 1, 65_535),
      DEFAULT_RUNTIME_CONFIG.port,
    ),
    throttle: {
      ttl: collect(
        errors,
        readInteger(env, 'THROTTLE_TTL', DEFAULT_RUNTIME_CONFIG.throttle.ttl),
        DEFAULT_RUNTIME_CONFIG.throttle.ttl,
      ),
      limit: collect(
        errors,
        readInteger(env, 'THROTTLE_LIMIT', DEFAULT_RUNTIME_CONFIG.throttle.limit),
        DEFAULT_RUNTIME_CONFIG.throttle.limit,
      ),
    },
    auth: {
      jwtSecret: collect(
        errors,
        readJwtSecret(env, nodeEnv),
        DEFAULT_RUNTIME_CONFIG.auth.jwtSecret,
      ),
      jwtExpiresIn: collect(
        errors,
        readString(env, 'JWT_EXPIRES_IN', DEFAULT_RUNTIME_CONFIG.auth.jwtExpiresIn),
        DEFAULT_RUNTIME_CONFIG.auth.jwtExpiresIn,
      ),
    },
    stellar: {
      horizonUrl: collect(
        errors,
        readUrl(env, 'STELLAR_HORIZON_URL', DEFAULT_RUNTIME_CONFIG.stellar.horizonUrl),
        DEFAULT_RUNTIME_CONFIG.stellar.horizonUrl,
      ),
      sorobanRpcUrl: collect(
        errors,
        readUrl(
          env,
          'STELLAR_SOROBAN_RPC_URL',
          DEFAULT_RUNTIME_CONFIG.stellar.sorobanRpcUrl,
        ),
        DEFAULT_RUNTIME_CONFIG.stellar.sorobanRpcUrl,
      ),
      networkPassphrase: collect(
        errors,
        readString(
          env,
          'STELLAR_NETWORK_PASSPHRASE',
          DEFAULT_RUNTIME_CONFIG.stellar.networkPassphrase,
        ),
        DEFAULT_RUNTIME_CONFIG.stellar.networkPassphrase,
      ),
    },
    indexer: {
      contractId: collect(
        errors,
        readString(env, 'STELLAR_CONTRACT_ID', DEFAULT_RUNTIME_CONFIG.indexer.contractId),
        DEFAULT_RUNTIME_CONFIG.indexer.contractId,
      ),
      startLedger: collect(
        errors,
        readInteger(
          env,
          'STELLAR_INDEXER_START_LEDGER',
          DEFAULT_RUNTIME_CONFIG.indexer.startLedger,
          1,
        ),
        DEFAULT_RUNTIME_CONFIG.indexer.startLedger,
      ),
      pollIntervalMs: collect(
        errors,
        readInteger(
          env,
          'STELLAR_INDEXER_POLL_INTERVAL_MS',
          DEFAULT_RUNTIME_CONFIG.indexer.pollIntervalMs,
          100,
        ),
        DEFAULT_RUNTIME_CONFIG.indexer.pollIntervalMs,
      ),
    },
  };

  if (errors.length > 0) {
    throw new EnvironmentValidationError(errors);
  }

  return {
    ...env,
    runtime: runtimeConfig,
    PORT: runtimeConfig.port,
    THROTTLE_TTL: runtimeConfig.throttle.ttl,
    THROTTLE_LIMIT: runtimeConfig.throttle.limit,
    JWT_SECRET: runtimeConfig.auth.jwtSecret,
    JWT_EXPIRES_IN: runtimeConfig.auth.jwtExpiresIn,
    STELLAR_HORIZON_URL: runtimeConfig.stellar.horizonUrl,
    STELLAR_SOROBAN_RPC_URL: runtimeConfig.stellar.sorobanRpcUrl,
    STELLAR_NETWORK_PASSPHRASE: runtimeConfig.stellar.networkPassphrase,
    STELLAR_CONTRACT_ID: runtimeConfig.indexer.contractId,
    STELLAR_INDEXER_START_LEDGER: runtimeConfig.indexer.startLedger,
    STELLAR_INDEXER_POLL_INTERVAL_MS: runtimeConfig.indexer.pollIntervalMs,
  };
}

export function redactRuntimeConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      const upperKey = key.toUpperCase();
      const shouldRedact = SENSITIVE_RUNTIME_CONFIG_KEYS.some((sensitiveKey) =>
        upperKey.includes(sensitiveKey),
      );

      return [key, shouldRedact ? '[REDACTED]' : value];
    }),
  );
}

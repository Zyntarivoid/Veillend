import {
  EnvironmentValidationError,
  redactRuntimeConfig,
  validateEnvironment,
} from './env.validation';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  THROTTLE_TTL: '30000',
  THROTTLE_LIMIT: '50',
  JWT_SECRET: 'a-valid-test-secret-with-more-than-32-chars',
  JWT_EXPIRES_IN: '1h',
  STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org/',
  STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org/',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  STELLAR_CONTRACT_ID:
    'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
  STELLAR_INDEXER_START_LEDGER: '42',
  STELLAR_INDEXER_POLL_INTERVAL_MS: '1500',
};

describe('validateEnvironment', () => {
  it('returns a typed runtime config with normalized values', () => {
    const result = validateEnvironment(validEnv);

    expect(result.runtime).toEqual({
      nodeEnv: 'test',
      port: 4000,
      throttle: {
        ttl: 30000,
        limit: 50,
      },
      auth: {
        jwtSecret: 'a-valid-test-secret-with-more-than-32-chars',
        jwtExpiresIn: '1h',
      },
      stellar: {
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      },
      indexer: {
        contractId:
          'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
        startLedger: 42,
        pollIntervalMs: 1500,
      },
    });
  });

  it('fails fast with clear messages for invalid URLs, numbers, and weak secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validEnv,
        PORT: '70000',
        JWT_SECRET: 'short',
        STELLAR_HORIZON_URL: 'not-a-url',
        STELLAR_INDEXER_POLL_INTERVAL_MS: '5',
      }),
    ).toThrow(EnvironmentValidationError);

    try {
      validateEnvironment({
        ...validEnv,
        PORT: '70000',
        JWT_SECRET: 'short',
        STELLAR_HORIZON_URL: 'not-a-url',
        STELLAR_INDEXER_POLL_INTERVAL_MS: '5',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as Error).message).toContain('PORT must be an integer');
      expect((error as Error).message).toContain(
        'JWT_SECRET must be at least 32 characters long',
      );
      expect((error as Error).message).toContain(
        'STELLAR_HORIZON_URL must be a valid URL',
      );
      expect((error as Error).message).toContain(
        'STELLAR_INDEXER_POLL_INTERVAL_MS must be an integer',
      );
    }
  });

  it('requires an explicit non-default JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: undefined,
      }),
    ).toThrow('JWT_SECRET is required');
  });
});

describe('redactRuntimeConfig', () => {
  it('redacts sensitive values but leaves non-sensitive config visible', () => {
    expect(
      redactRuntimeConfig({
        JWT_SECRET: 'do-not-print',
        STELLAR_SECRET_KEY: 'do-not-print',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        PORT: 3000,
      }),
    ).toEqual({
      JWT_SECRET: '[REDACTED]',
      STELLAR_SECRET_KEY: '[REDACTED]',
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      PORT: 3000,
    });
  });
});

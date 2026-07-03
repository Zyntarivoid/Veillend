import { redactSensitiveConfig, validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('applies safe development defaults', () => {
    const config = validateEnvironment({});

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      THROTTLE_TTL: 60000,
      THROTTLE_LIMIT: 100,
      AUTH_THROTTLE_TTL: 60000,
      AUTH_THROTTLE_LIMIT: 5,
      JWT_SECRET: 'SUPER_SECRET',
      JWT_EXPIRES_IN: '7d',
      STELLAR_NETWORK: 'testnet',
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      STELLAR_INDEXER_START_LEDGER: 1,
      STELLAR_INDEXER_POLL_INTERVAL_MS: 5000,
    });
  });

  it('normalizes numeric values from strings', () => {
    const config = validateEnvironment({
      PORT: '4000',
      THROTTLE_TTL: '1000',
      THROTTLE_LIMIT: '20',
      AUTH_THROTTLE_TTL: '2000',
      AUTH_THROTTLE_LIMIT: '3',
      STELLAR_INDEXER_START_LEDGER: '42',
      STELLAR_INDEXER_POLL_INTERVAL_MS: '2500',
    });

    expect(config.PORT).toBe(4000);
    expect(config.THROTTLE_LIMIT).toBe(20);
    expect(config.STELLAR_INDEXER_START_LEDGER).toBe(42);
    expect(config.STELLAR_INDEXER_POLL_INTERVAL_MS).toBe(2500);
  });

  it('fails fast with clear messages for invalid startup configuration', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'invalid',
        PORT: 'abc',
        STELLAR_HORIZON_URL: 'not-a-url',
        STELLAR_SOROBAN_RPC_URL: 'ftp://rpc.example.com',
      }),
    ).toThrow(
      /NODE_ENV must be one of development, test, production[\s\S]*PORT must be a positive integer[\s\S]*STELLAR_HORIZON_URL must be a valid URL[\s\S]*STELLAR_SOROBAN_RPC_URL must use http or https/,
    );
  });

  it('requires a non-default JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow(/JWT_SECRET is required when NODE_ENV is production/);

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'short',
      }),
    ).toThrow(/JWT_SECRET must be at least 16 characters in production/);
  });

  it('redacts sensitive configuration values', () => {
    const redacted = redactSensitiveConfig({
      JWT_SECRET: 'do-not-log-me',
      STELLAR_NETWORK: 'testnet',
    });

    expect(redacted).toEqual({
      JWT_SECRET: '[redacted]',
      STELLAR_NETWORK: 'testnet',
    });
  });
});

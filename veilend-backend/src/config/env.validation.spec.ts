import { getSafeRuntimeConfig, validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('returns typed defaults for local development', () => {
    const config = validateEnvironment({});

    expect(config.PORT).toBe(3000);
    expect(config.THROTTLE_LIMIT).toBe(100);
    expect(config.STELLAR_HORIZON_URL).toBe(
      'https://horizon-testnet.stellar.org',
    );
    expect(config.JWT_SECRET).toBe('development-only-jwt-secret');
  });

  it('parses provided numeric and URL configuration', () => {
    const config = validateEnvironment({
      PORT: '4000',
      THROTTLE_TTL: '120000',
      STELLAR_HORIZON_URL: 'https://example.com/horizon',
      STELLAR_SOROBAN_RPC_URL: 'https://example.com/rpc',
      JWT_SECRET: 'a-secret-with-enough-length',
    });

    expect(config.PORT).toBe(4000);
    expect(config.THROTTLE_TTL).toBe(120_000);
    expect(config.STELLAR_SOROBAN_RPC_URL).toBe('https://example.com/rpc');
  });

  it('fails fast with clear messages for invalid values', () => {
    expect(() =>
      validateEnvironment({
        PORT: 'zero',
        JWT_SECRET: 'short',
        STELLAR_HORIZON_URL: 'not-a-url',
      }),
    ).toThrow(
      'Invalid environment configuration: PORT must be a positive integer; JWT_SECRET must be at least 16 characters; STELLAR_HORIZON_URL must be a valid URL',
    );
  });

  it('requires an explicit JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'Invalid environment configuration: JWT_SECRET is required in production',
    );
  });

  it('omits sensitive values from safe runtime config', () => {
    const config = validateEnvironment({
      JWT_SECRET: 'a-secret-with-enough-length',
    });

    expect(getSafeRuntimeConfig(config)).not.toHaveProperty('JWT_SECRET');
  });
});

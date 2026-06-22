export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  throttle: {
    ttl: number;
    limit: number;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
  };
  stellar: {
    horizonUrl: string;
    sorobanRpcUrl: string;
    networkPassphrase: string;
  };
  indexer: {
    contractId: string;
    startLedger: number;
    pollIntervalMs: number;
  };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  nodeEnv: 'development',
  port: 3000,
  throttle: {
    ttl: 60_000,
    limit: 100,
  },
  auth: {
    jwtSecret: 'development-only-jwt-secret-change-me',
    jwtExpiresIn: '7d',
  },
  stellar: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  indexer: {
    contractId: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
    startLedger: 1,
    pollIntervalMs: 5_000,
  },
};

export const SENSITIVE_RUNTIME_CONFIG_KEYS = [
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'STELLAR_SECRET_KEY',
  'STELLAR_ADMIN_SECRET',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'API_KEY',
  'PASSWORD',
  'TOKEN',
] as const;

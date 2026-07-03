import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService', () => {
  it('returns injectable auth config for JWT setup', () => {
    const service = new RuntimeConfigService(
      new ConfigService({
        JWT_SECRET: 'configured-secret',
        JWT_EXPIRES_IN: '15m',
      }),
    );

    expect(service.getAuthConfig()).toEqual({
      jwtSecret: 'configured-secret',
      jwtExpiresIn: '15m',
    });
  });

  it('returns a safe runtime snapshot without exposing secrets', () => {
    const service = new RuntimeConfigService(
      new ConfigService({
        NODE_ENV: 'test',
        PORT: 4000,
        JWT_SECRET: 'configured-secret',
        JWT_EXPIRES_IN: '15m',
        STELLAR_NETWORK: 'testnet',
        STELLAR_HORIZON_URL: 'https://horizon.example.com',
        STELLAR_SOROBAN_RPC_URL: 'https://rpc.example.com',
        STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        STELLAR_CONTRACT_ID: 'contract-id',
        STELLAR_INDEXER_START_LEDGER: 10,
        STELLAR_INDEXER_POLL_INTERVAL_MS: 2500,
      }),
    );

    const snapshot = service.getSafeConfig();

    expect(snapshot.auth).toEqual({
      jwtSecretConfigured: true,
      jwtExpiresIn: '15m',
    });
    expect(JSON.stringify(snapshot)).not.toContain('configured-secret');
    expect(snapshot.stellar.sorobanRpcUrl).toBe('https://rpc.example.com');
    expect(snapshot.indexer.pollIntervalMs).toBe(2500);
  });
});

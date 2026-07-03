import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AuthRuntimeConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface SafeRuntimeConfig {
  nodeEnv: string;
  port: number;
  throttling: {
    ttl: number;
    limit: number;
    authTtl: number;
    authLimit: number;
  };
  auth: {
    jwtSecretConfigured: boolean;
    jwtExpiresIn: string;
  };
  stellar: {
    network: string;
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

@Injectable()
export class RuntimeConfigService {
  constructor(private readonly configService: ConfigService) {}

  getAuthConfig(): AuthRuntimeConfig {
    return {
      jwtSecret: this.getString('JWT_SECRET', 'SUPER_SECRET'),
      jwtExpiresIn: this.getString('JWT_EXPIRES_IN', '7d'),
    };
  }

  getSafeConfig(): SafeRuntimeConfig {
    const auth = this.getAuthConfig();

    return {
      nodeEnv: this.getString('NODE_ENV', 'development'),
      port: this.getNumber('PORT', 3000),
      throttling: {
        ttl: this.getNumber('THROTTLE_TTL', 60000),
        limit: this.getNumber('THROTTLE_LIMIT', 100),
        authTtl: this.getNumber('AUTH_THROTTLE_TTL', 60000),
        authLimit: this.getNumber('AUTH_THROTTLE_LIMIT', 5),
      },
      auth: {
        jwtSecretConfigured: auth.jwtSecret.length > 0,
        jwtExpiresIn: auth.jwtExpiresIn,
      },
      stellar: {
        network: this.getString('STELLAR_NETWORK', 'testnet'),
        horizonUrl: this.getString(
          'STELLAR_HORIZON_URL',
          'https://horizon-testnet.stellar.org',
        ),
        sorobanRpcUrl: this.getString(
          'STELLAR_SOROBAN_RPC_URL',
          'https://soroban-testnet.stellar.org',
        ),
        networkPassphrase: this.getString(
          'STELLAR_NETWORK_PASSPHRASE',
          'Test SDF Network ; September 2015',
        ),
      },
      indexer: {
        contractId: this.getString(
          'STELLAR_CONTRACT_ID',
          'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
        ),
        startLedger: this.getNumber('STELLAR_INDEXER_START_LEDGER', 1),
        pollIntervalMs: this.getNumber(
          'STELLAR_INDEXER_POLL_INTERVAL_MS',
          5000,
        ),
      },
    };
  }

  private getString(key: string, fallback: string): string {
    return this.configService.get<string>(key) ?? fallback;
  }

  private getNumber(key: string, fallback: number): number {
    return this.configService.get<number>(key) ?? fallback;
  }
}

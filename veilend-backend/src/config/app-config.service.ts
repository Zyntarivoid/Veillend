import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  get stellar(): {
    network: string;
    horizonUrls: string[];
    sorobanRpcUrls: string[];
    networkPassphrase: string;
  } {
    return {
      network: this.configService.get<string>('STELLAR_NETWORK', 'testnet'),
      horizonUrls: this.configService
        .get<string>(
          'STELLAR_HORIZON_URLS',
          this.configService.get<string>(
            'STELLAR_HORIZON_URL',
            'https://horizon-testnet.stellar.org',
          ),
        )
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
      sorobanRpcUrls: this.configService
        .get<string>(
          'STELLAR_SOROBAN_RPC_URLS',
          this.configService.get<string>(
            'STELLAR_SOROBAN_RPC_URL',
            'https://soroban-testnet.stellar.org',
          ),
        )
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
      networkPassphrase: this.configService.get<string>(
        'STELLAR_NETWORK_PASSPHRASE',
        'Test SDF Network ; September 2015',
      ),
    };
  }

  get indexer(): {
    contractId: string;
    startLedger: number;
    pollIntervalMs: number;
  } {
    return {
      contractId: this.configService.get<string>(
        'STELLAR_CONTRACT_ID',
        'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
      ),
      startLedger: this.configService.get<number>(
        'STELLAR_INDEXER_START_LEDGER',
        1,
      ),
      pollIntervalMs: this.configService.get<number>(
        'STELLAR_INDEXER_POLL_INTERVAL_MS',
        5000,
      ),
    };
  }

  get auth(): {
    jwtSecret: string;
  } {
    return {
      jwtSecret: this.configService.get<string>('JWT_SECRET', 'dev_secret'),
    };
  }

  get adminActions(): {
    watcherPollIntervalMs: number;
  } {
    return {
      watcherPollIntervalMs: this.configService.get<number>(
        'ADMIN_ACTION_WATCHER_POLL_INTERVAL_MS',
        10000,
      ),
    };
  }
}

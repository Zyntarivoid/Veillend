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
    verifiedAssetList: Record<string, string[]>;
  } {
    let verifiedAssetList: Record<string, string[]> = {};
    try {
      const val = this.configService.get<string>('VERIFIED_ASSET_LIST');
      if (val) {
        verifiedAssetList = JSON.parse(val) as Record<string, string[]>;
      }
    } catch {
      // Ignore
    }

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
      verifiedAssetList,
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
    jwtExpiresIn: string;
    jwtIssuer: string;
    jwtAudience: string;
    legacyAuthAllow: boolean;
  } {
    return {
      jwtSecret: this.configService.get<string>('JWT_SECRET', 'dev_secret'),
      jwtExpiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      jwtIssuer: this.configService.get<string>('JWT_ISSUER', 'veilend'),
      jwtAudience: this.configService.get<string>(
        'JWT_AUDIENCE',
        'veilend-app',
      ),
      legacyAuthAllow: this.configService.get<boolean>(
        'LEGACY_AUTH_ALLOW',
        true,
      ),
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

  get notifications(): {
    expoAccessToken?: string;
  } {
    return {
      expoAccessToken: this.configService.get<string>('EXPO_ACCESS_TOKEN'),
    };
  }

  get riskScan(): {
    intervalMs: number;
    batchSize: number;
    leaseTtlMs: number;
  } {
    return {
      intervalMs: this.configService.get<number>(
        'RISK_SCAN_INTERVAL_MS',
        60_000,
      ),
      batchSize: this.configService.get<number>('RISK_SCAN_BATCH_SIZE', 500),
      leaseTtlMs: this.configService.get<number>(
        'RISK_SCAN_LEASE_TTL_MS',
        180_000,
      ),
    };
  }

  get deposits(): {
    watcherPollIntervalMs: number;
    defaultMinConfirmations: number;
    assetConfirmations: Record<string, number>;
  } {
    let assetConfirmations: Record<string, number> = {};
    try {
      const val = this.configService.get<string>('DEPOSIT_ASSET_CONFIRMATIONS');
      if (val) {
        assetConfirmations = JSON.parse(val) as Record<string, number>;
      }
    } catch {
      // Ignore
    }

    return {
      watcherPollIntervalMs: this.configService.get<number>(
        'DEPOSIT_WATCHER_POLL_INTERVAL_MS',
        15000,
      ),
      defaultMinConfirmations: this.configService.get<number>(
        'DEPOSIT_DEFAULT_MIN_CONFIRMATIONS',
        5,
      ),
      assetConfirmations,
    };
  }

  get withdrawals(): {
    watcherPollIntervalMs: number;
    defaultMinConfirmations: number;
    timelockHours: number;
    instantWhitelistMaxUsd: number;
  } {
    return {
      watcherPollIntervalMs: this.configService.get<number>(
        'WITHDRAWAL_WATCHER_POLL_INTERVAL_MS',
        15000,
      ),
      defaultMinConfirmations: this.configService.get<number>(
        'WITHDRAWAL_DEFAULT_MIN_CONFIRMATIONS',
        10,
      ),
      timelockHours: this.configService.get<number>(
        'WITHDRAWAL_TIMELOCK_HOURS',
        24,
      ),
      instantWhitelistMaxUsd: this.configService.get<number>(
        'WITHDRAWAL_INSTANT_WHITELIST_MAX_USD',
        50,
      ),
    };
  }
}

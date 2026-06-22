import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfig } from './runtime-config';
import { redactRuntimeConfig } from './env.validation';

@Injectable()
export class RuntimeConfigService {
  constructor(private readonly configService: ConfigService) {}

  get runtime(): RuntimeConfig {
    return this.configService.getOrThrow<RuntimeConfig>('runtime');
  }

  get port(): number {
    return this.runtime.port;
  }

  get throttleTtl(): number {
    return this.runtime.throttle.ttl;
  }

  get throttleLimit(): number {
    return this.runtime.throttle.limit;
  }

  get jwtSecret(): string {
    return this.runtime.auth.jwtSecret;
  }

  get jwtExpiresIn(): string {
    return this.runtime.auth.jwtExpiresIn;
  }

  get stellarHorizonUrl(): string {
    return this.runtime.stellar.horizonUrl;
  }

  get stellarSorobanRpcUrl(): string {
    return this.runtime.stellar.sorobanRpcUrl;
  }

  get stellarNetworkPassphrase(): string {
    return this.runtime.stellar.networkPassphrase;
  }

  get indexerContractId(): string {
    return this.runtime.indexer.contractId;
  }

  get indexerStartLedger(): number {
    return this.runtime.indexer.startLedger;
  }

  get indexerPollIntervalMs(): number {
    return this.runtime.indexer.pollIntervalMs;
  }

  safeSnapshot(): Record<string, unknown> {
    return redactRuntimeConfig({
      NODE_ENV: this.runtime.nodeEnv,
      PORT: this.port,
      THROTTLE_TTL: this.throttleTtl,
      THROTTLE_LIMIT: this.throttleLimit,
      JWT_SECRET: this.jwtSecret,
      JWT_EXPIRES_IN: this.jwtExpiresIn,
      STELLAR_HORIZON_URL: this.stellarHorizonUrl,
      STELLAR_SOROBAN_RPC_URL: this.stellarSorobanRpcUrl,
      STELLAR_NETWORK_PASSPHRASE: this.stellarNetworkPassphrase,
      STELLAR_CONTRACT_ID: this.indexerContractId,
      STELLAR_INDEXER_START_LEDGER: this.indexerStartLedger,
      STELLAR_INDEXER_POLL_INTERVAL_MS: this.indexerPollIntervalMs,
    });
  }
}

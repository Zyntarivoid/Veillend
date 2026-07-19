import { registerAs } from '@nestjs/config';
import type { ConfigService } from '@nestjs/config';

export interface StellarConfig {
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
}

export default registerAs(
  'stellar',
  (configService: ConfigService): StellarConfig => ({
    horizonUrl: configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    ),
    sorobanRpcUrl: configService.get<string>(
      'STELLAR_SOROBAN_RPC_URL',
      'https://soroban-testnet.stellar.org',
    ),
    networkPassphrase: configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    ),
  }),
);

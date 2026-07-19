import { registerAs } from '@nestjs/config';

export interface StellarConfig {
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
}

export default registerAs(
  'stellar',
  (configService: { get: (key: string, defaultValue: string) => string }): StellarConfig => ({
    horizonUrl: configService.get(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    ),
    sorobanRpcUrl: configService.get(
      'STELLAR_SOROBAN_RPC_URL',
      'https://soroban-testnet.stellar.org',
    ),
    networkPassphrase: configService.get(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    ),
  }),
);

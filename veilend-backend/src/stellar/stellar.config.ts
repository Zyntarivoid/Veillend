import { registerAs } from '@nestjs/config';

export default registerAs('stellar', () => ({
  horizonUrl: process.env.STELLAR_HORIZON_URL || ' `https://horizon-testnet.stellar.org` ',
  sorobanRpcUrl: process.env.STELLAR_SOROBAN_RPC_URL || ' `https://soroban-testnet.stellar.org` ',
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
}));

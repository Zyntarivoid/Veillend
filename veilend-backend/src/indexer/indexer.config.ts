import { registerAs } from '@nestjs/config';

export default registerAs('indexer', () => ({
  pollIntervalMs: parseInt(process.env.STELLAR_INDEXER_POLL_INTERVAL_MS || '5000', 10),
  contractId: process.env.STELLAR_CONTRACT_ID || 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
  startLedger: parseInt(process.env.STELLAR_INDEXER_START_LEDGER || '1', 10),
}));

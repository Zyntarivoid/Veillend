import { registerAs } from '@nestjs/config';

export interface IndexerConfig {
  contractId: string;
  startLedger: number;
  pollIntervalMs: number;
}

export default registerAs(
  'indexer',
  (configService: {
    get: (key: string, defaultValue: any) => any;
  }): IndexerConfig => ({
    contractId: configService.get(
      'STELLAR_CONTRACT_ID',
      'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
    ),
    startLedger: configService.get('STELLAR_INDEXER_START_LEDGER', 1),
    pollIntervalMs: configService.get('STELLAR_INDEXER_POLL_INTERVAL_MS', 5000),
  }),
);

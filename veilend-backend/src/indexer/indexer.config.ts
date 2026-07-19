import { registerAs } from '@nestjs/config';
import type { ConfigService } from '@nestjs/config';

export interface IndexerConfig {
  contractId: string;
  startLedger: number;
  pollIntervalMs: number;
}

export default registerAs(
  'indexer',
  (configService: ConfigService): IndexerConfig => ({
    contractId: configService.get<string>(
      'STELLAR_CONTRACT_ID',
      'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
    ),
    startLedger: configService.get<number>('STELLAR_INDEXER_START_LEDGER', 1),
    pollIntervalMs: configService.get<number>(
      'STELLAR_INDEXER_POLL_INTERVAL_MS',
      5000,
    ),
  }),
);

import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class IndexerConfig {
  @IsOptional()
  @IsString()
  STELLAR_CONTRACT_ID: string =
    'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ';

  @IsOptional()
  @IsInt()
  @Min(1)
  STELLAR_INDEXER_START_LEDGER: number = 1;

  @IsOptional()
  @IsInt()
  @Min(100)
  STELLAR_INDEXER_POLL_INTERVAL_MS: number = 5000;
}

import { TransactionStatus, TransactionType } from '@prisma/client';

export class TransactionRecordDto {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  /** Amount formatted using the asset's decimals, derived from amountRaw. */
  readonly amount: number;
  readonly amountUsd: number;
  readonly assetCode: string;
  readonly assetSymbol: string;
  readonly txHash: string | null;
  readonly ledgerSequence: number | null;
  readonly sorobanEventId: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
}

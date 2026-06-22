import { IndexerTransaction } from '../../indexer/indexer.repository';

export type TransactionActivityType = IndexerTransaction['type'];

export class TransactionActivityDto {
  readonly id: string;
  readonly walletAddress: string;
  readonly type: TransactionActivityType;
  readonly assetAddress: string;
  readonly amount: string;
  readonly ledger: number;
  readonly txHash: string;
  readonly timestamp: string;

  constructor(transaction: IndexerTransaction, timestamp: string) {
    this.id = transaction.id;
    this.walletAddress = transaction.userAddress;
    this.type = transaction.type;
    this.assetAddress = transaction.assetAddress;
    this.amount = transaction.amount;
    this.ledger = transaction.ledger;
    this.txHash = transaction.txHash;
    this.timestamp = timestamp;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { HorizonService } from '../stellar/horizon.service';
import { ServiceResponse } from '../stellar/types';

export interface TransactionRecord {
  id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'transfer';
  amount: number;
  asset: string;
  timestamp: string;
  status: string;
  txHash: string;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly horizonService: HorizonService) {}

  async getTransactions(walletAddress: string): Promise<ServiceResponse<TransactionRecord[]>> {
    try {
      const client = this.horizonService.getClient();
      const txs = await client.transactions().forAccount(walletAddress).limit(20).order('desc').call();

      const records: TransactionRecord[] = txs.records.map((tx) => {
        // Determine transaction type from operations
        let type: TransactionRecord['type'] = 'transfer';
        let amount = 0;
        let asset = 'XLM';

        if (tx.operations && tx.operations.length > 0) {
          const op = tx.operations[0] as Record<string, unknown>;
          const opType = op.type as string | undefined;
          if (opType === 'payment') {
            type = 'transfer';
            amount = parseFloat(String(op.amount ?? '')) || 0;
            asset = String(op.asset_code ?? 'XLM');
          } else if (opType === 'change_trust') {
            type = 'deposit';
            amount = parseFloat(String(op.limit ?? '')) || 0;
            asset = String(op.asset_code ?? 'UNKNOWN');
          }
        }

        return {
          id: tx.id,
          type,
          amount,
          asset,
          timestamp: tx.created_at,
          status: tx.successful ? 'success' : 'failed',
          txHash: tx.hash,
        };
      });

      return {
        success: true,
        data: records,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
      this.logger.warn(`Transaction fetch failed for ${walletAddress}: ${message}`);
      return {
        success: false,
        error: { message, code: 'TRANSACTIONS_FETCH_ERROR', rawError: error },
      };
    }
  }
}

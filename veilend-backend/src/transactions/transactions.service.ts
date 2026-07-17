import { Injectable, Logger } from '@nestjs/common';
import { HorizonService } from '../stellar/horizon.service';
import { ServiceResponse } from '../stellar/types';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionHistoryQueryDto, NormalizedEventType } from './dto/transaction-history-query.dto';
import {
  TransactionEventDto,
  TransactionHistoryPageDto,
  NormalizedStatus,
} from './dto/transaction-history-response.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';

export interface TransactionRecord {
  id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'transfer';
  amount: number;
  asset: string;
  timestamp: string;
  status: string;
  txHash: string;
}

/**
 * Map Prisma TransactionType enum values to normalized lowercase event types.
 */
const TYPE_MAP: Record<string, NormalizedEventType> = {
  DEPOSIT: NormalizedEventType.DEPOSIT,
  WITHDRAW: NormalizedEventType.WITHDRAW,
  BORROW: NormalizedEventType.BORROW,
  REPAY: NormalizedEventType.REPAY,
  LIQUIDATION: NormalizedEventType.LIQUIDATION,
};

/**
 * Map Prisma TransactionStatus enum values to normalized lowercase statuses.
 */
const STATUS_MAP: Record<string, NormalizedStatus> = {
  PENDING: NormalizedStatus.PENDING,
  CONFIRMED: NormalizedStatus.CONFIRMED,
  FAILED: NormalizedStatus.FAILED,
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly horizonService: HorizonService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Retrieve paginated, normalized transaction history from the database.
   * Supports filtering by event type, status, asset, and date range.
   *
   * @param walletAddress - The authenticated user's wallet address
   * @param query - Pagination and filter parameters
   * @returns Paginated response with normalized transaction events
   */
  async getTransactionHistory(
    walletAddress: string,
    query: TransactionHistoryQueryDto,
  ): Promise<TransactionHistoryPageDto> {
    // Build the where clause for filtering
    const where: Record<string, unknown> = {
      user: { walletAddress },
    };

    if (query.type) {
      where.type = query.type.toUpperCase();
    }
    if (query.status) {
      where.status = query.status.toUpperCase();
    }
    if (query.assetId) {
      where.assetId = query.assetId;
    }
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.gte = new Date(query.from);
      if (query.to) createdAt.lte = new Date(query.to);
      where.createdAt = createdAt;
    }

    // Determine sort order
    const orderBy: Record<string, string> = {
      createdAt: query.order === 'ASC' ? 'asc' : 'desc',
    };

    // Execute count + data query in parallel
    const [itemCount, records] = await Promise.all([
      this.prisma.transactionHistory.count({ where }),
      this.prisma.transactionHistory.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        include: {
          asset: {
            select: { code: true, symbol: true },
          },
        },
      }),
    ]);

    // Normalize records to TransactionEventDto
    const data: TransactionEventDto[] = records.map((tx) => ({
      id: tx.id,
      type: TYPE_MAP[tx.type] ?? NormalizedEventType.DEPOSIT,
      status: STATUS_MAP[tx.status] ?? NormalizedStatus.PENDING,
      amountRaw: tx.amountRaw.toString(),
      amountUsd: tx.amountUsd.toString(),
      assetCode: tx.asset.code,
      assetSymbol: tx.asset.symbol,
      txHash: tx.txHash,
      ledgerSequence: tx.ledgerSequence,
      contractId: tx.contractId,
      memo: tx.memo,
      timestamp: tx.createdAt.toISOString(),
      confirmedAt: tx.confirmedAt ? tx.confirmedAt.toISOString() : null,
    }));

    // Build pagination metadata
    const meta = new PageMetaDto({
      pageOptionsDto: query,
      itemCount,
    });

    return {
      data,
      meta: {
        page: meta.page,
        take: meta.take,
        itemCount: meta.itemCount,
        pageCount: meta.pageCount,
        hasPreviousPage: meta.hasPreviousPage,
        hasNextPage: meta.hasNextPage,
      },
    };
  }

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
            const rawAmount = op.amount;
            amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : 0;
            const rawAssetCode = op.asset_code;
            asset = typeof rawAssetCode === 'string' ? rawAssetCode : 'XLM';
          } else if (opType === 'change_trust') {
            type = 'deposit';
            const rawLimit = op.limit;
            amount = typeof rawLimit === 'string' ? parseFloat(rawLimit) : 0;
            const rawAssetCode = op.asset_code;
            asset = typeof rawAssetCode === 'string' ? rawAssetCode : 'UNKNOWN';
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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageDto } from '../common/dto/page.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { formatRawAmount } from '../common/utils/format-raw-amount';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { TransactionRecordDto } from './dto/transaction-record.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads the indexer's TransactionHistory table, which is derived from
   * classified Soroban protocol events, rather than raw Horizon transaction
   * history (which included unrelated ops like `change_trust`).
   *
   * The two queries (findMany + count) are wrapped in a RepeatableRead
   * transaction so they see the same consistent snapshot — preventing phantom
   * rows from causing the count to disagree with the returned page.
   * No write locks are acquired; this is a read-only path.
   */
  async getTransactions(
    walletAddress: string,
    query: GetTransactionsQueryDto,
  ): Promise<PageDto<TransactionRecordDto>> {
    return this.prisma.withRepeatableRead(async (db) => {
      const user = await db.user.findUnique({
        where: { walletAddress },
      });

      if (!user) {
        throw new NotFoundException(
          `No indexed data found for wallet ${walletAddress}`,
        );
      }

      const where = {
        userId: user.id,
        ...(query.type ? { type: query.type } : {}),
      };

      const [records, itemCount] = await Promise.all([
        db.transactionHistory.findMany({
          where,
          include: { asset: true },
          take: query.take,
          skip: query.skip,
          orderBy: {
            createdAt: query.order.toLowerCase() as 'asc' | 'desc',
          },
        }),
        db.transactionHistory.count({ where }),
      ]);

      const data: TransactionRecordDto[] = records.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: formatRawAmount(tx.amountRaw, tx.asset.decimals),
        amountUsd: Number(tx.amountUsd),
        assetCode: tx.asset.code,
        assetSymbol: tx.asset.symbol,
        txHash: tx.txHash,
        ledgerSequence: tx.ledgerSequence,
        sorobanEventId: tx.sorobanEventId,
        createdAt: tx.createdAt,
        confirmedAt: tx.confirmedAt,
      }));

      this.logger.debug(
        `Fetched ${data.length}/${itemCount} transaction(s) for ${walletAddress}`,
      );

      const pageMetaDto = new PageMetaDto({ pageOptionsDto: query, itemCount });
      return new PageDto(data, pageMetaDto);
    });
  }
}

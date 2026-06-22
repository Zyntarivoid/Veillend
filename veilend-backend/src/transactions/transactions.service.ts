import { Injectable } from '@nestjs/common';
import { IndexerRepository } from '../indexer/indexer.repository';
import { Order, PageOptionsDto } from '../common/dto/page-options.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { PageDto } from '../common/dto/page.dto';
import { TransactionActivityDto } from './dto/transaction-activity.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly indexerRepository: IndexerRepository) {}

  async getHistory(
    walletAddress: string,
    pageOptionsDto: PageOptionsDto,
  ): Promise<PageDto<TransactionActivityDto>> {
    const pageOptions = this.normalizePageOptions(pageOptionsDto);
    const transactions =
      await this.indexerRepository.getTransactions(walletAddress);

    const normalized = transactions
      .map((transaction) => {
        const timestamp = this.normalizeTimestamp(transaction.timestamp);
        return new TransactionActivityDto(transaction, timestamp);
      })
      .sort((a, b) => this.compareActivity(a, b, pageOptions.order));

    const data = normalized.slice(
      pageOptions.skip,
      pageOptions.skip + pageOptions.take,
    );
    const meta = new PageMetaDto({
      pageOptionsDto: pageOptions,
      itemCount: normalized.length,
    });

    return new PageDto(data, meta);
  }

  async getActivityFeed(
    walletAddress: string,
    pageOptionsDto: PageOptionsDto,
  ): Promise<PageDto<TransactionActivityDto>> {
    return this.getHistory(walletAddress, pageOptionsDto);
  }

  private normalizePageOptions(pageOptionsDto: PageOptionsDto): PageOptionsDto {
    const defaults = new PageOptionsDto();
    const page = this.clampInteger(
      Number(pageOptionsDto?.page ?? defaults.page),
      1,
    );
    const take = this.clampInteger(
      Number(pageOptionsDto?.take ?? defaults.take),
      1,
      50,
    );
    const order =
      pageOptionsDto?.order === Order.ASC ||
      pageOptionsDto?.order === Order.DESC
        ? pageOptionsDto.order
        : Order.DESC;

    return Object.assign(defaults, { page, take, order });
  }

  private clampInteger(value: number, min: number, max?: number): number {
    if (!Number.isInteger(value) || value < min) {
      return min;
    }
    if (max !== undefined && value > max) {
      return max;
    }
    return value;
  }

  private normalizeTimestamp(timestamp: string): string {
    const time = Date.parse(timestamp);
    if (Number.isNaN(time)) {
      return new Date(0).toISOString();
    }
    return new Date(time).toISOString();
  }

  private compareActivity(
    a: TransactionActivityDto,
    b: TransactionActivityDto,
    order: Order,
  ): number {
    const direction = order === Order.ASC ? 1 : -1;
    const timestampDelta = Date.parse(a.timestamp) - Date.parse(b.timestamp);

    if (timestampDelta !== 0) {
      return timestampDelta * direction;
    }

    return (a.ledger - b.ledger) * direction;
  }
}

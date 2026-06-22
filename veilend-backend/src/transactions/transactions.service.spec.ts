import 'reflect-metadata';
import { Order, PageOptionsDto } from '../common/dto/page-options.dto';
import {
  IndexerRepository,
  IndexerTransaction,
} from '../indexer/indexer.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: jest.Mocked<Pick<IndexerRepository, 'getTransactions'>>;

  beforeEach(() => {
    repository = {
      getTransactions: jest.fn(),
    };
    service = new TransactionsService(repository as IndexerRepository);
  });

  it('returns paginated activity sorted by newest first by default', async () => {
    repository.getTransactions.mockResolvedValue([
      createTransaction('old', 'deposit', '2026-06-20T10:00:00Z', 100),
      createTransaction('new', 'repay', '2026-06-22T10:00:00Z', 102),
      createTransaction('middle', 'borrow', '2026-06-21T10:00:00Z', 101),
    ]);

    const result = await service.getHistory('GABC', {
      page: 1,
      take: 2,
    } as PageOptionsDto);

    expect(repository.getTransactions).toHaveBeenCalledWith('GABC');
    expect(result.data.map((item) => item.id)).toEqual(['new', 'middle']);
    expect(result.meta).toMatchObject({
      page: 1,
      take: 2,
      itemCount: 3,
      pageCount: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('supports ascending order and normalizes timestamps', async () => {
    repository.getTransactions.mockResolvedValue([
      createTransaction('invalid', 'withdraw', 'not-a-date', 99),
      createTransaction('valid', 'deposit', '2026-06-20T10:00:00.000Z', 100),
    ]);

    const result = await service.getActivityFeed('GABC', {
      order: Order.ASC,
      page: 1,
      take: 10,
    } as PageOptionsDto);

    expect(result.data.map((item) => item.id)).toEqual(['invalid', 'valid']);
    expect(result.data[0].timestamp).toBe('1970-01-01T00:00:00.000Z');
    expect(result.data[1].timestamp).toBe('2026-06-20T10:00:00.000Z');
  });

  it('clamps invalid page options', async () => {
    repository.getTransactions.mockResolvedValue([
      createTransaction('tx-1', 'deposit', '2026-06-20T10:00:00Z', 100),
    ]);

    const result = await service.getHistory('GABC', {
      order: 'INVALID',
      page: -1,
      take: 100,
    } as unknown as PageOptionsDto);

    expect(result.meta).toMatchObject({
      page: 1,
      take: 50,
      itemCount: 1,
    });
  });
});

function createTransaction(
  id: string,
  type: IndexerTransaction['type'],
  timestamp: string,
  ledger: number,
): IndexerTransaction {
  return {
    id,
    userAddress: 'GABC',
    type,
    assetAddress: 'CASSET',
    amount: '1000',
    ledger,
    txHash: `hash-${id}`,
    timestamp,
  };
}

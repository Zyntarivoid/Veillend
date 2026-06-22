import 'reflect-metadata';
import { PageDto } from '../common/dto/page.dto';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { PageOptionsDto } from '../common/dto/page-options.dto';
import { TransactionActivityDto } from './dto/transaction-activity.dto';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: jest.Mocked<
    Pick<TransactionsService, 'getHistory' | 'getActivityFeed'>
  >;
  let page: PageDto<TransactionActivityDto>;

  beforeEach(() => {
    page = new PageDto(
      [],
      new PageMetaDto({
        pageOptionsDto: new PageOptionsDto(),
        itemCount: 0,
      }),
    );
    service = {
      getHistory: jest.fn().mockResolvedValue(page),
      getActivityFeed: jest.fn().mockResolvedValue(page),
    };
    controller = new TransactionsController(service as TransactionsService);
  });

  it('returns wallet transaction history', async () => {
    const query = { page: 1, take: 10 } as PageOptionsDto;

    await expect(controller.getHistory('GABC', query)).resolves.toBe(page);
    expect(service.getHistory).toHaveBeenCalledWith('GABC', query);
  });

  it('returns wallet activity feed', async () => {
    const query = { page: 2, take: 5 } as PageOptionsDto;

    await expect(controller.getActivityFeed('GABC', query)).resolves.toBe(page);
    expect(service.getActivityFeed).toHaveBeenCalledWith('GABC', query);
  });
});

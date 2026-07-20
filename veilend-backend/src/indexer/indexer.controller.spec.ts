/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerController } from './indexer.controller';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';

describe('IndexerController', () => {
  let controller: IndexerController;
  let indexerService: {
    getPositions: jest.Mock;
    getTransactions: jest.Mock;
    forceReplay: jest.Mock;
  };
  let repository: { getCheckpoint: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    indexerService = {
      getPositions: jest.fn(),
      getTransactions: jest.fn(),
      forceReplay: jest.fn(),
    };
    repository = { getCheckpoint: jest.fn() };
    configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndexerController],
      providers: [
        { provide: IndexerService, useValue: indexerService },
        { provide: IndexerRepository, useValue: repository },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(IndexerController);
  });

  it('GET /indexer/status returns checkpoint + config', async () => {
    repository.getCheckpoint.mockResolvedValue({ lastIndexedLedger: 7 });

    const result = await controller.getStatus();

    expect(result).toEqual(
      expect.objectContaining({ status: 'active', lastIndexedLedger: 7 }),
    );
  });

  it('GET /indexer/positions/:address returns { address, positions }', async () => {
    indexerService.getPositions.mockResolvedValue([{ deposited: '100' }]);

    const result = await controller.getPositions('GABC');

    expect(result).toEqual({
      address: 'GABC',
      positions: [{ deposited: '100' }],
    });
  });

  it('GET /indexer/transactions/:address returns { address, transactions }', async () => {
    indexerService.getTransactions.mockResolvedValue([{ id: 'evt-1' }]);

    const result = await controller.getTransactions('GABC');

    expect(result).toEqual({
      address: 'GABC',
      transactions: [{ id: 'evt-1' }],
    });
  });

  it('POST /indexer/replay triggers a replay and returns a message', async () => {
    const result = await controller.triggerReplay();

    expect(indexerService.forceReplay).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { rpc } from '@stellar/stellar-sdk';
import { AdminActionWatcherService } from './admin-action-watcher.service';
import { AppConfigService } from '../config/app-config.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { IndexerService } from '../indexer/indexer.service';
import { AdminActionRepository } from './admin-action.repository';

describe('AdminActionWatcherService', () => {
  let service: AdminActionWatcherService;

  const mockConfigService = {
    adminActions: { watcherPollIntervalMs: 10000 },
  };

  const getTransaction = jest.fn();
  const mockRpcService = {
    getTransaction,
  };

  const mockRepository = {
    findSubmitted: jest.fn(),
    markConfirmed: jest.fn(),
    markFailed: jest.fn(),
  };

  const mockIndexerService = {
    runIndexer: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockIndexerService.runIndexer.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminActionWatcherService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SorobanRpcService,
          useValue: mockRpcService,
        },
        {
          provide: AdminActionRepository,
          useValue: mockRepository,
        },
        {
          provide: IndexerService,
          useValue: mockIndexerService,
        },
      ],
    }).compile();

    service = module.get<AdminActionWatcherService>(AdminActionWatcherService);
  });

  const sentAction = (id: string, txHash = `${id}-hash`) => ({
    id,
    txHash,
  });

  it('should flip a SENT action to CONFIRMED on a SUCCESS result', async () => {
    mockRepository.findSubmitted.mockResolvedValue([sentAction('a1', 'h1')]);
    getTransaction.mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
    });

    await service.runWatcher();

    expect(mockRepository.markConfirmed).toHaveBeenCalledWith('a1');
    expect(mockRepository.markFailed).not.toHaveBeenCalled();
  });

  it('should flip a SENT action to FAILED with an error message on a FAILED result', async () => {
    mockRepository.findSubmitted.mockResolvedValue([sentAction('a1', 'h1')]);
    getTransaction.mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.FAILED,
    });

    await service.runWatcher();

    expect(mockRepository.markFailed).toHaveBeenCalledWith(
      'a1',
      'Transaction failed on-chain',
    );
    expect(mockRepository.markConfirmed).not.toHaveBeenCalled();
  });

  it('should leave a NOT_FOUND transaction untouched', async () => {
    mockRepository.findSubmitted.mockResolvedValue([sentAction('a1', 'h1')]);
    getTransaction.mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.NOT_FOUND,
    });

    await service.runWatcher();

    expect(mockRepository.markConfirmed).not.toHaveBeenCalled();
    expect(mockRepository.markFailed).not.toHaveBeenCalled();
  });

  it('should keep polling past a single failing action', async () => {
    mockRepository.findSubmitted.mockResolvedValue([
      sentAction('a1', 'h1'),
      sentAction('a2', 'h2'),
    ]);
    getTransaction
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.SUCCESS });

    await service.runWatcher();

    expect(mockRepository.markConfirmed).toHaveBeenCalledWith('a2');
  });
});

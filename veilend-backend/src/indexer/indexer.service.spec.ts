/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { scValToNative } from '@stellar/stellar-sdk';

// Mock the scValToNative helper from SDK
jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    scValToNative: jest.fn().mockImplementation((val) => val),
  };
});

describe('IndexerService', () => {
  let service: IndexerService;
  let mockRpcClient: {
    getHealth: jest.Mock;
    getLatestLedger: jest.Mock;
    getEvents: jest.Mock;
  };

  const mockRepository = {
    getCheckpoint: jest.fn(),
    saveCheckpoint: jest.fn(),
    saveTransaction: jest.fn(),
    updatePosition: jest.fn(),
    setAssetSupported: jest.fn(),
    resetDatabase: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRpcClient = {
      getHealth: jest.fn().mockResolvedValue({
        oldestLedger: 10,
        latestLedger: 100,
        status: 'healthy',
      }),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 50 }),
      getEvents: jest.fn().mockResolvedValue({ events: [], cursor: 'abc' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        {
          provide: IndexerRepository,
          useValue: mockRepository,
        },
        {
          provide: SorobanRpcService,
          useValue: {
            getClient: () => mockRpcClient,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue: unknown) => {
                if (key === 'indexer.contractId')
                  return 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ';
                if (key === 'indexer.startLedger') return 1;
                if (key === 'indexer.pollIntervalMs') return 5000;
                return defaultValue;
              }),
          },
        },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runIndexer', () => {
    it('should query RPC for events and update checkpoint', async () => {
      mockRepository.getCheckpoint.mockResolvedValueOnce({
        lastIndexedLedger: 20,
      });
      mockRpcClient.getLatestLedger.mockResolvedValueOnce({ sequence: 25 });

      // Mock an event return
      const mockEvent = {
        id: 'evt-1',
        topic: ['veillend', 'deposit', 'user-addr', 'asset-addr'],
        value: 1000n,
        ledgerClosedAt: '2026-06-16T17:00:00Z',
        txHash: 'txhash123',
        ledger: 22,
      };

      mockRpcClient.getEvents.mockResolvedValueOnce({
        events: [mockEvent],
        cursor: 'next-page-cursor',
      });

      // Mock mock scValToNative return behavior
      const mockScValToNative = scValToNative as jest.Mock;
      mockScValToNative.mockImplementation((val) => val);

      await service.runIndexer();

      expect(mockRpcClient.getLatestLedger).toHaveBeenCalled();
      expect(mockRpcClient.getEvents).toHaveBeenCalled();
      expect(mockRepository.saveTransaction).toHaveBeenCalledWith({
        id: 'evt-1',
        userAddress: 'user-addr',
        type: 'deposit',
        assetAddress: 'asset-addr',
        amount: '1000',
        ledger: 22,
        txHash: 'txhash123',
        timestamp: '2026-06-16T17:00:00Z',
      });
      expect(mockRepository.updatePosition).toHaveBeenCalledWith(
        'user-addr',
        'asset-addr',
        1000n,
        0n,
      );
      expect(mockRepository.saveCheckpoint).toHaveBeenCalledWith(22);
    });

    it('should forward checkpoint if lastIndexedLedger is older than RPC oldestLedger', async () => {
      mockRepository.getCheckpoint.mockResolvedValueOnce({
        lastIndexedLedger: 5,
      });
      mockRpcClient.getHealth.mockResolvedValueOnce({
        oldestLedger: 20,
        latestLedger: 100,
      });
      mockRpcClient.getLatestLedger.mockResolvedValueOnce({ sequence: 30 });
      mockRpcClient.getEvents.mockResolvedValueOnce({ events: [] });

      await service.runIndexer();

      // Should check events starting from 20 (oldestLedger)
      expect(mockRpcClient.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          startLedger: 20,
        }),
      );
      expect(mockRepository.saveCheckpoint).toHaveBeenCalledWith(30);
    });
  });

  describe('processEvent scenarios', () => {
    beforeEach(() => {
      mockRepository.getCheckpoint.mockResolvedValue({ lastIndexedLedger: 10 });
      mockRpcClient.getLatestLedger.mockResolvedValue({ sequence: 15 });
    });

    it('should process borrow event', async () => {
      const mockEvent = {
        id: 'evt-2',
        topic: ['veillend', 'borrow', 'user-addr', 'asset-addr'],
        value: 500n,
        ledger: 12,
      };
      mockRpcClient.getEvents.mockResolvedValueOnce({ events: [mockEvent] });

      await service.runIndexer();

      expect(mockRepository.saveTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'borrow',
          amount: '500',
        }),
      );
      expect(mockRepository.updatePosition).toHaveBeenCalledWith(
        'user-addr',
        'asset-addr',
        0n,
        500n,
      );
    });

    it('should process withdraw event', async () => {
      const mockEvent = {
        id: 'evt-3',
        topic: ['veillend', 'withdraw', 'user-addr', 'asset-addr'],
        value: 200n,
        ledger: 13,
      };
      mockRpcClient.getEvents.mockResolvedValueOnce({ events: [mockEvent] });

      await service.runIndexer();

      expect(mockRepository.updatePosition).toHaveBeenCalledWith(
        'user-addr',
        'asset-addr',
        -200n,
        0n,
      );
    });

    it('should process repay event', async () => {
      const mockEvent = {
        id: 'evt-4',
        topic: ['veillend', 'repay', 'user-addr', 'asset-addr'],
        value: 100n,
        ledger: 14,
      };
      mockRpcClient.getEvents.mockResolvedValueOnce({ events: [mockEvent] });

      await service.runIndexer();

      expect(mockRepository.updatePosition).toHaveBeenCalledWith(
        'user-addr',
        'asset-addr',
        0n,
        -100n,
      );
    });

    it('should process asset_configured event', async () => {
      const mockEvent = {
        id: 'evt-5',
        topic: ['veillend', 'asset_configured', 'admin-addr', 'asset-addr'],
        value: true,
        ledger: 15,
      };
      mockRpcClient.getEvents.mockResolvedValueOnce({ events: [mockEvent] });

      await service.runIndexer();

      expect(mockRepository.setAssetSupported).toHaveBeenCalledWith(
        'asset-addr',
        true,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { IndexerController } from './indexer.controller';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';
import { PrismaService } from '../prisma/prisma.service';

const VALID_ADDRESS_A =
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
const VALID_ADDRESS_B =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('IndexerController', () => {
  let controller: IndexerController;
  let indexerService: {
    getPositions: jest.Mock;
    getTransactions: jest.Mock;
    forceReplay: jest.Mock;
    replay: jest.Mock;
    getSyncStats: jest.Mock;
    getReplayState: jest.Mock;
    getIsProcessing: jest.Mock;
    isReplayRunning: jest.Mock;
    setReplayRunning: jest.Mock;
  };
  let repository: { getCheckpoint: jest.Mock };
  let configService: { get: jest.Mock };
  let prisma: { adminAuditLog: { create: jest.Mock } };

  beforeEach(async () => {
    indexerService = {
      getPositions: jest.fn(),
      getTransactions: jest.fn(),
      forceReplay: jest.fn(),
      replay: jest.fn(),
      getSyncStats: jest.fn(),
      getReplayState: jest.fn(),
      getIsProcessing: jest.fn().mockReturnValue(false),
      isReplayRunning: jest.fn().mockReturnValue(false),
      setReplayRunning: jest.fn(),
    };
    repository = { getCheckpoint: jest.fn() };
    configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    prisma = { adminAuditLog: { create: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndexerController],
      providers: [
        { provide: IndexerService, useValue: indexerService },
        { provide: IndexerRepository, useValue: repository },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(IndexerController);
  });

  it('GET /indexer/status returns sync stats + config', async () => {
    indexerService.getSyncStats.mockResolvedValue({
      syncStatus: 'idle',
      currentLedger: 100,
      lastIndexedLedger: 100,
      latestLedger: 105,
      lag: 5,
      percent: 95,
      eta: null,
      dedupCounter: 10,
      insertedCounter: 90,
      lastError: null,
      isProcessing: false,
      replay: { status: 'idle' },
    });

    const result = await controller.getStatus();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'active',
        currentLedger: 100,
        latestLedger: 105,
        lag: 5,
        dedupCounter: 10,
      }),
    );
  });

  it('GET /indexer/replay/status returns current replay state', () => {
    indexerService.getReplayState.mockReturnValue({
      status: 'running',
      percent: 45,
      etaSeconds: 12,
    });

    const result = controller.getReplayStatus();
    expect(result).toEqual({
      status: 'running',
      percent: 45,
      etaSeconds: 12,
    });
  });

  it('GET /indexer/positions/:address returns { address, positions }', async () => {
    indexerService.getPositions.mockResolvedValue([{ deposited: '100' }]);

    const result = await controller.getPositions({
      address: VALID_ADDRESS_A,
    });

    expect(result).toEqual({
      address: VALID_ADDRESS_A,
      positions: [{ deposited: '100' }],
    });
  });

  it('GET /indexer/transactions/:address returns { address, transactions }', async () => {
    indexerService.getTransactions.mockResolvedValue([{ id: 'evt-1' }]);

    const result = await controller.getTransactions({
      address: VALID_ADDRESS_B,
    });

    expect(result).toEqual({
      address: VALID_ADDRESS_B,
      transactions: [{ id: 'evt-1' }],
    });
  });

  describe('POST /indexer/replay', () => {
    it('triggers incremental replay, records an audit row, and returns progress summary', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };
      indexerService.replay.mockResolvedValue({
        success: true,
        message: 'Replay completed successfully from ledger 0 to 500',
        status: 'completed',
        fromLedger: 0,
        toLedger: 500,
        chunk: 100,
        inserted: 0,
        already_processed: 500,
        alreadyProcessed: 500,
        currentLedger: 500,
        percent: 100,
      });

      const result = await controller.triggerReplay(req, '0', '500', '100');

      expect(indexerService.replay).toHaveBeenCalledWith({
        fromLedger: 0,
        toLedger: 500,
        chunk: 100,
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorWallet: VALID_ADDRESS_A,
          action: 'INDEXER_REPLAY',
          payload: {
            fromLedger: 0,
            toLedger: 500,
            chunk: 100,
            inserted: 0,
            already_processed: 500,
          },
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          fromLedger: 0,
          toLedger: 500,
          chunk: 100,
          inserted: 0,
          already_processed: 500,
        }),
      );
    });

    it('triggers replay using request body parameters when query parameters are not provided', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };
      indexerService.replay.mockResolvedValue({
        success: true,
        message: 'Replay completed successfully from ledger 100 to 200',
        status: 'completed',
        fromLedger: 100,
        toLedger: 200,
        chunk: 50,
        inserted: 10,
        already_processed: 90,
        alreadyProcessed: 90,
        currentLedger: 200,
        percent: 100,
      });

      const body = { fromLedger: 100, toLedger: 200, chunk: 50 };
      const result = await controller.triggerReplay(
        req,
        undefined,
        undefined,
        undefined,
        body,
      );

      expect(indexerService.replay).toHaveBeenCalledWith({
        fromLedger: 100,
        toLedger: 200,
        chunk: 50,
      });
      expect(result.fromLedger).toBe(100);
      expect(result.toLedger).toBe(200);
      expect(result.chunk).toBe(50);
      expect(result.inserted).toBe(10);
    });

    it('does not run a replay when no authenticated user is present', async () => {
      const req = { user: undefined };

      await expect(
        controller.triggerReplay(req, '0', '500', '100'),
      ).rejects.toThrow(UnauthorizedException);
      expect(indexerService.replay).not.toHaveBeenCalled();
    });

    it('returns 409 Conflict when indexer is already processing', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };
      indexerService.getIsProcessing.mockReturnValue(true);

      await expect(
        controller.triggerReplay(req, '0', '500', '100'),
      ).rejects.toThrow(ConflictException);
      expect(indexerService.replay).not.toHaveBeenCalled();
    });

    it('returns 409 Conflict when replay is already running', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };
      indexerService.isReplayRunning.mockReturnValue(true);

      await expect(
        controller.triggerReplay(req, '0', '500', '100'),
      ).rejects.toThrow(ConflictException);
      expect(indexerService.replay).not.toHaveBeenCalled();
    });

    it('returns 400 when scope=full without confirm header', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };

      await expect(
        controller.triggerReplay(req, '0', '500', '100', 'full'),
      ).rejects.toThrow(BadRequestException);
      expect(indexerService.replay).not.toHaveBeenCalled();
    });

    it('returns 400 when scope=full with wrong confirm header', async () => {
      const req = {
        user: { walletAddress: VALID_ADDRESS_A },
        headers: { 'x-confirm-full-wipe': 'no' },
      };

      await expect(
        controller.triggerReplay(req, '0', '500', '100', 'full', 'no'),
      ).rejects.toThrow(BadRequestException);
      expect(indexerService.replay).not.toHaveBeenCalled();
    });

    it('proceeds with full wipe when scope=full with correct confirm header', async () => {
      const req = {
        user: { walletAddress: VALID_ADDRESS_A },
        headers: { 'x-confirm-full-wipe': 'yes' },
      };
      indexerService.replay.mockResolvedValue({
        success: true,
        message: 'Replay completed',
        status: 'completed',
        fromLedger: 0,
        toLedger: 500,
        chunk: 100,
        inserted: 10,
        already_processed: 490,
        alreadyProcessed: 490,
        currentLedger: 500,
        percent: 100,
      });

      const result = await controller.triggerReplay(
        req,
        '0',
        '500',
        '100',
        'full',
        'yes',
      );

      expect(indexerService.forceReplay).toHaveBeenCalledWith('full');
      expect(result.success).toBe(true);
    });
  });

  describe('Concurrent replay calls', () => {
    it('only one concurrent call succeeds when two POSTs are made simultaneously', async () => {
      const req = { user: { walletAddress: VALID_ADDRESS_A } };
      indexerService.replay.mockImplementation(async () => {
        // Simulate a delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          success: true,
          message: 'Replay completed',
          status: 'completed',
          fromLedger: 0,
          toLedger: 500,
          chunk: 100,
          inserted: 10,
          already_processed: 490,
          alreadyProcessed: 490,
          currentLedger: 500,
          percent: 100,
        };
      });

      // Make two concurrent calls
      const call1 = controller.triggerReplay(req, '0', '500', '100');
      const call2 = controller.triggerReplay(req, '0', '500', '100');

      const results = await Promise.allSettled([call1, call2]);

      // One should succeed, one should fail with ConflictException
      const successCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const failureCount = results.filter(
        (r) => r.status === 'rejected',
      ).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });
  });
});

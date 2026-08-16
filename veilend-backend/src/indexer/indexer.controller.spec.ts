/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { IndexerController } from './indexer.controller';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('IndexerController', () => {
  let controller: IndexerController;
  let indexerService: {
    getPositions: jest.Mock;
    getTransactions: jest.Mock;
    forceReplay: jest.Mock;
    getIsProcessing: jest.Mock;
  };
  let repository: { getCheckpoint: jest.Mock };
  let configService: { get: jest.Mock };

  const mockAdminReq = {
    user: { walletAddress: 'GADMIN123' },
  };

  beforeEach(async () => {
    indexerService = {
      getPositions: jest.fn(),
      getTransactions: jest.fn(),
      forceReplay: jest.fn(),
      getIsProcessing: jest.fn().mockReturnValue(false),
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
        { provide: PrismaService, useValue: {} },
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

  describe('POST /indexer/replay', () => {
    it('triggers a scoped replay with default parameters', async () => {
      indexerService.forceReplay.mockResolvedValue(undefined);

      const result = await controller.triggerReplay(
        'bad-only',
        undefined,
        mockAdminReq as any,
      );

      expect(indexerService.forceReplay).toHaveBeenCalledWith({
        scope: 'bad-only',
        actorWallet: 'GADMIN123',
        confirmFullWipe: false,
      });
      expect(result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('bad-only'),
        }),
      );
    });

    it('triggers a full wipe when scope=full and confirmation header is yes', async () => {
      indexerService.forceReplay.mockResolvedValue(undefined);

      const result = await controller.triggerReplay(
        'full',
        'yes',
        mockAdminReq as any,
      );

      expect(indexerService.forceReplay).toHaveBeenCalledWith({
        scope: 'full',
        actorWallet: 'GADMIN123',
        confirmFullWipe: true,
      });
      expect(result).toEqual(
        expect.objectContaining({ message: expect.stringContaining('full') }),
      );
    });

    it('throws BadRequestException when scope=full without confirmation header', async () => {
      await expect(
        controller.triggerReplay('full', undefined, mockAdminReq as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an invalid scope value', async () => {
      await expect(
        controller.triggerReplay('invalid', undefined, mockAdminReq as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

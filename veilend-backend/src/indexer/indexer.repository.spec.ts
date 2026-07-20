/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { IndexerRepository, IndexerTransaction } from './indexer.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('IndexerRepository', () => {
  let repository: IndexerRepository;
  let prisma: {
    indexerCheckpoint: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { upsert: jest.Mock };
    asset: { upsert: jest.Mock; findMany: jest.Mock };
    transactionHistory: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    position: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      indexerCheckpoint: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { upsert: jest.fn() },
      asset: { upsert: jest.fn(), findMany: jest.fn() },
      transactionHistory: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      position: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(IndexerRepository);
  });

  describe('getCheckpoint', () => {
    it('defaults to 0 when no row exists', async () => {
      prisma.indexerCheckpoint.findUnique.mockResolvedValue(null);

      expect(await repository.getCheckpoint()).toEqual({
        lastIndexedLedger: 0,
      });
    });

    it('returns the stored ledger', async () => {
      prisma.indexerCheckpoint.findUnique.mockResolvedValue({
        id: 'global',
        lastIndexedLedger: 42,
      });

      expect(await repository.getCheckpoint()).toEqual({
        lastIndexedLedger: 42,
      });
    });
  });

  describe('saveCheckpoint', () => {
    it('upserts the global checkpoint row', async () => {
      await repository.saveCheckpoint(99);

      expect(prisma.indexerCheckpoint.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        create: { id: 'global', lastIndexedLedger: 99 },
        update: { lastIndexedLedger: 99 },
      });
    });
  });

  describe('saveTransaction', () => {
    const tx: IndexerTransaction = {
      id: 'evt-1',
      userAddress: 'GABC',
      type: 'deposit',
      assetAddress: 'CONTRACT1',
      amount: '1000',
      ledger: 5,
      txHash: 'hash1',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    it('creates a new row and returns true when not seen before', async () => {
      prisma.transactionHistory.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockResolvedValue({});

      const result = await repository.saveTransaction(tx);

      expect(result).toBe(true);
      expect(prisma.transactionHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          assetId: 'asset-1',
          sorobanEventId: 'evt-1',
          amountRaw: 1000n,
          amountUsd: 0,
        }),
      });
    });

    it('returns false without creating when already seen (duplicate)', async () => {
      prisma.transactionHistory.findUnique.mockResolvedValue({ id: 'row-1' });

      const result = await repository.saveTransaction(tx);

      expect(result).toBe(false);
      expect(prisma.transactionHistory.create).not.toHaveBeenCalled();
    });

    it('returns false (not throw) on a race-condition unique violation', async () => {
      prisma.transactionHistory.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      const result = await repository.saveTransaction(tx);

      expect(result).toBe(false);
    });
  });

  describe('updatePosition', () => {
    beforeEach(() => {
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
    });

    it('accumulates deltas onto an existing position', async () => {
      prisma.position.findUnique.mockResolvedValue({
        depositedRaw: 100n,
        borrowedRaw: 50n,
      });

      await repository.updatePosition('GABC', 'CONTRACT1', 20n, -10n);

      expect(prisma.position.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            depositedRaw: 120n,
            borrowedRaw: 40n,
          }),
        }),
      );
    });

    it('clamps balances to a minimum of 0', async () => {
      prisma.position.findUnique.mockResolvedValue({
        depositedRaw: 5n,
        borrowedRaw: 5n,
      });

      await repository.updatePosition('GABC', 'CONTRACT1', -100n, -100n);

      expect(prisma.position.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            depositedRaw: 0n,
            borrowedRaw: 0n,
          }),
        }),
      );
    });

    it('starts from 0 when no position exists yet', async () => {
      prisma.position.findUnique.mockResolvedValue(null);

      await repository.updatePosition('GABC', 'CONTRACT1', 30n, 0n);

      expect(prisma.position.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ depositedRaw: 30n }),
        }),
      );
    });
  });

  describe('setAssetSupported', () => {
    it('upserts the asset with the supported flag', async () => {
      await repository.setAssetSupported('CONTRACT1', true);

      expect(prisma.asset.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contractId: 'contract1' },
          update: { isSupported: true },
        }),
      );
    });
  });

  describe('address case-insensitivity', () => {
    it('normalizes mixed-case addresses the same as lowercase', async () => {
      prisma.transactionHistory.findMany.mockResolvedValue([]);

      await repository.getTransactions('GaBc');

      expect(prisma.transactionHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { walletAddress: 'gabc' } },
        }),
      );
    });
  });

  describe('resetDatabase', () => {
    it('only clears indexer-owned rows, not users/assets/admins', async () => {
      await repository.resetDatabase();

      expect(prisma.transactionHistory.deleteMany).toHaveBeenCalledWith({
        where: { sorobanEventId: { not: null } },
      });
      expect(prisma.position.deleteMany).toHaveBeenCalledWith({});
      expect(prisma.indexerCheckpoint.deleteMany).toHaveBeenCalledWith({
        where: { id: 'global' },
      });
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });
  });
});

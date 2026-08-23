/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  IndexerRepository,
  IndexerTransaction,
  extractEventIndex,
} from './indexer.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('IndexerRepository', () => {
  let repository: IndexerRepository;
  let prisma: {
    indexerCheckpoint: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    indexerEventDedup: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { upsert: jest.Mock };
    asset: { upsert: jest.Mock; findMany: jest.Mock };
    transactionHistory: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    liquidationEvent: {
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
    withSerializable: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      indexerCheckpoint: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      indexerEventDedup: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { upsert: jest.fn() },
      asset: { upsert: jest.fn(), findMany: jest.fn() },
      transactionHistory: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      liquidationEvent: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      position: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      // withSerializable passthrough: delegates directly to the callback
      // with `prisma` itself so unit tests don't need a real DB.
      withSerializable: jest.fn(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      ),
      // Keep $transaction for the resetDatabase batch path (array form).
      $transaction: jest.fn(async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(IndexerRepository);
  });

  describe('extractEventIndex', () => {
    it('extracts index from formatted event ID', () => {
      expect(extractEventIndex('0000000001-0000000005')).toBe(5);
      expect(extractEventIndex('ledger-tx-2')).toBe(2);
    });

    it('returns hash or 0 on non-hyphenated ID', () => {
      expect(extractEventIndex('')).toBe(0);
      expect(typeof extractEventIndex('singleword')).toBe('number');
    });
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

  describe('isEventDuplicate & recordEventDedup', () => {
    it('returns true when event is found in IndexerEventDedup with future expiry', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue({
        eventId: 'evt-1',
        expiresAt: new Date(Date.now() + 60000),
      });

      const isDup = await repository.isEventDuplicate('evt-1');
      expect(isDup).toBe(true);
    });

    it('returns true when event is found in TransactionHistory', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue({ id: 'row-1' });

      const isDup = await repository.isEventDuplicate('evt-1', 'tx1', 0);
      expect(isDup).toBe(true);
    });

    it('records event dedup with TTL', async () => {
      await repository.recordEventDedup('evt-1', 'tx1', 0, 50, 3600);
      expect(prisma.indexerEventDedup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'evt-1' },
          create: expect.objectContaining({
            eventId: 'evt-1',
            txHash: 'tx1',
            eventIndex: 0,
            ledger: 50,
          }),
        }),
      );
    });

    it('cleans up expired dedup entries', async () => {
      prisma.indexerEventDedup.deleteMany.mockResolvedValue({ count: 5 });
      const count = await repository.cleanExpiredDedup();
      expect(count).toBe(5);
      expect(prisma.indexerEventDedup.deleteMany).toHaveBeenCalled();
    });
  });

  describe('processEventSafe & applyEvent', () => {
    const tx: IndexerTransaction = {
      id: '0000000001-0000000001',
      userAddress: 'GABC',
      type: 'deposit',
      assetAddress: 'CONTRACT1',
      amount: '1000',
      ledger: 5,
      txHash: 'hash1',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    // Prisma.sql templates expose the interpolated values on `.values`.
    const sqlValues = (call: unknown[]): unknown[] =>
      (call[0] as { values: unknown[] }).values;
    const sqlText = (call: unknown[]): string =>
      (call[0] as { strings: string[] }).strings.join(' ');

    it('creates a new row, records dedup, and applies the position delta, returning true when new', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockResolvedValue({});
      prisma.indexerEventDedup.upsert.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.applyEvent(tx, 100n, 0n);

      expect(result).toBe(true);
      expect(prisma.transactionHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          assetId: 'asset-1',
          sorobanEventId: tx.id,
          txHash: 'hash1',
          eventIndex: 1,
          amountRaw: 1000n,
          amountUsd: 0,
        }),
      });
      // Position write happened: ensure-exists insert + locked update.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.indexerEventDedup.upsert).toHaveBeenCalled();
    });

    it('returns false without writing when already seen (duplicate in lookaside)', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue({
        eventId: tx.id,
        expiresAt: new Date(Date.now() + 60000),
      });

      const result = await repository.applyEvent(tx, 100n, 0n);

      expect(result).toBe(false);
      expect(prisma.transactionHistory.create).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns false (not throw) on a race-condition unique violation', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      const result = await repository.applyEvent(tx, 100n, 0n);

      expect(result).toBe(false);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('accumulates deltas onto an existing position under a row lock', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockResolvedValue({});
      prisma.indexerEventDedup.upsert.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        { depositedRaw: 100n, borrowedRaw: 50n },
      ]);

      await repository.applyEvent(tx, 20n, -10n);

      expect(sqlText(prisma.$queryRaw.mock.calls[0])).toContain('FOR UPDATE');
      // Second $executeRaw is the locked UPDATE with the accumulated values.
      expect(sqlValues(prisma.$executeRaw.mock.calls[1])).toEqual([
        120n,
        40n,
        'user-1',
        'asset-1',
      ]);
    });

    it('clamps balances to a minimum of 0', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockResolvedValue({});
      prisma.indexerEventDedup.upsert.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        { depositedRaw: 5n, borrowedRaw: 5n },
      ]);

      await repository.applyEvent(tx, -100n, -100n);

      expect(sqlValues(prisma.$executeRaw.mock.calls[1])).toEqual([
        0n,
        0n,
        'user-1',
        'asset-1',
      ]);
    });
  });

  describe('processChunk', () => {
    it('applies all events and advances checkpoint inside transaction', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.asset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.transactionHistory.create.mockResolvedValue({});
      prisma.indexerEventDedup.upsert.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([]);

      const events = [
        {
          tx: {
            id: 'evt-1',
            userAddress: 'GABC',
            type: 'deposit' as const,
            assetAddress: 'CONTRACT1',
            amount: '100',
            ledger: 10,
            txHash: 'tx1',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          depositedDelta: 100n,
          borrowedDelta: 0n,
        },
        {
          tx: {
            id: 'evt-2',
            userAddress: 'GABC',
            type: 'borrow' as const,
            assetAddress: 'CONTRACT1',
            amount: '50',
            ledger: 10,
            txHash: 'tx2',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          depositedDelta: 0n,
          borrowedDelta: 50n,
        },
      ];

      const result = await repository.processChunk(events, 10);

      expect(result).toEqual({ inserted: 2, alreadyProcessed: 0 });
      expect(prisma.indexerCheckpoint.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        create: { id: 'global', lastIndexedLedger: 10 },
        update: { lastIndexedLedger: 10 },
      });
    });
  });

  describe('resetDatabase', () => {
    it('clears indexer-owned rows including dedup table, but preserves users/assets', async () => {
      await repository.resetDatabase();

      expect(prisma.transactionHistory.deleteMany).toHaveBeenCalledWith({
        where: { sorobanEventId: { not: null } },
      });
      expect(prisma.liquidationEvent.deleteMany).toHaveBeenCalledWith({});
      expect(prisma.position.deleteMany).toHaveBeenCalledWith({});
      expect(prisma.indexerCheckpoint.deleteMany).toHaveBeenCalledWith({
        where: { id: 'global' },
      });
      expect(prisma.indexerEventDedup.deleteMany).toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });
  });

  describe('liquidation event processing', () => {
    const liquidationTx: IndexerTransaction = {
      id: '0000000007-0000000003',
      userAddress: 'GBORROWER',
      type: 'liquidation',
      assetAddress: 'DEBTCONTRACT',
      amount: '3000',
      ledger: 9,
      txHash: 'liqhash',
      timestamp: '2026-01-02T00:00:00.000Z',
    };

    const liquidationPayload = {
      liquidatorAddress: 'GLIQUIDATOR',
      borrowerAddress: 'GBORROWER',
      debtAsset: 'DEBTCONTRACT',
      collateralAsset: 'COLLCONTRACT',
      repaidRaw: 3000n,
      seizedRaw: 2500n,
      clipped: false,
      clippedByBps: null,
    };

    const mockResolvedParties = () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue(null);
      prisma.transactionHistory.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockImplementation(
        ({ where }: { where: { walletAddress: string } }) =>
          Promise.resolve(
            where.walletAddress === 'gborrower'
              ? { id: 'borrower-1' }
              : { id: 'liquidator-1' },
          ),
      );
      prisma.asset.upsert.mockImplementation(
        ({ where }: { where: { contractId: string } }) =>
          Promise.resolve(
            where.contractId === 'debtcontract'
              ? { id: 'asset-debt' }
              : { id: 'asset-coll' },
          ),
      );
      prisma.transactionHistory.create.mockResolvedValue({});
      prisma.liquidationEvent.create.mockResolvedValue({});
      prisma.indexerEventDedup.upsert.mockResolvedValue({});
    };

    it('writes a LiquidationEvent row, both parties history rows, and adjusts the borrower position on both assets', async () => {
      mockResolvedParties();
      // Locked reads: debt position first, then collateral position.
      prisma.$queryRaw
        .mockResolvedValueOnce([{ depositedRaw: 0n, borrowedRaw: 5000n }])
        .mockResolvedValueOnce([{ depositedRaw: 3000n, borrowedRaw: 0n }]);

      const result = await repository.processEventSafe({
        tx: liquidationTx,
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: liquidationPayload,
      });

      expect(result.isNew).toBe(true);

      // Shared read-model row.
      expect(prisma.liquidationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sorobanEventId: liquidationTx.id,
          txHash: 'liqhash',
          ledger: 9,
          liquidatorAddress: 'gliquidator',
          borrowerAddress: 'gborrower',
          debtAssetId: 'asset-debt',
          collateralAssetId: 'asset-coll',
          repaidRaw: 3000n,
          seizedRaw: 2500n,
          badDebt: false,
          clipped: false,
          clippedByBps: null,
        }),
      });

      // Both parties get a TransactionHistory row.
      const historyCalls = prisma.transactionHistory.create.mock
        .calls as unknown as Array<[{ data: Record<string, unknown> }]>;
      expect(historyCalls.length).toBe(2);
      expect(historyCalls[0][0].data).toMatchObject({
        userId: 'borrower-1',
        assetId: 'asset-debt',
        partyRole: 'BORROWER',
        amountRaw: 3000n,
        sorobanEventId: liquidationTx.id,
      });
      expect(historyCalls[1][0].data).toMatchObject({
        userId: 'liquidator-1',
        assetId: 'asset-coll',
        partyRole: 'LIQUIDATOR',
        amountRaw: 2500n,
        sorobanEventId: `${liquidationTx.id}:liq`,
      });

      // Position updates: debt −repaid (5000→2000), collateral −seized
      // (3000−2500 → 500).
      const execCalls = prisma.$executeRaw.mock.calls as unknown as Array<
        unknown[]
      >;
      // 2 ensure-row INSERTs + 2 balance UPDATEs
      expect(execCalls.length).toBe(4);
      const updateValues = (callIndex: number): unknown[] =>
        (execCalls[callIndex][0] as { values: unknown[] }).values;
      // calls[0] and [1] are the two ensure-row INSERTs; [2] and [3] are
      // the balance UPDATEs (debt asset first, then collateral asset).
      expect(updateValues(2)).toEqual([
        null,
        2000n,
        'borrower-1',
        'asset-debt',
      ]);
      expect(updateValues(3)).toEqual([500n, null, 'borrower-1', 'asset-coll']);
    });

    it('flags badDebt when seizure exhausts collateral while debt remains', async () => {
      mockResolvedParties();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ depositedRaw: 100n, borrowedRaw: 500n }])
        .mockResolvedValueOnce([{ depositedRaw: 800n, borrowedRaw: 0n }]);

      await repository.processEventSafe({
        tx: { ...liquidationTx, amount: '400' },
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: { ...liquidationPayload, repaidRaw: 400n },
      });

      expect(prisma.liquidationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ badDebt: true }),
      });
    });

    it('propagates the close-factor clip marker onto the stored row', async () => {
      mockResolvedParties();
      prisma.$queryRaw
        .mockResolvedValue([{ depositedRaw: 0n, borrowedRaw: 10_000n }])
        .mockResolvedValue([{ depositedRaw: 5_000n, borrowedRaw: 0n }]);

      await repository.processEventSafe({
        tx: liquidationTx,
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: {
          ...liquidationPayload,
          clipped: true,
          clippedByBps: 5000,
        },
      });

      expect(prisma.liquidationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clipped: true,
          clippedByBps: 5000,
        }),
      });
    });

    it('is idempotent: a replayed liquidation writes nothing new', async () => {
      prisma.indexerEventDedup.findUnique.mockResolvedValue({
        eventId: liquidationTx.id,
        expiresAt: new Date(Date.now() + 60000),
      });

      const result = await repository.processEventSafe({
        tx: liquidationTx,
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: liquidationPayload,
      });

      expect(result.isNew).toBe(false);
      expect(prisma.liquidationEvent.create).not.toHaveBeenCalled();
      expect(prisma.transactionHistory.create).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });
});

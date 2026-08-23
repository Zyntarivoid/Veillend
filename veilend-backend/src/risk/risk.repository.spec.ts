import {
  RiskRepository,
  decodeQueueCursor,
  encodeQueueCursor,
} from './risk.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('RiskRepository — liquidation queue', () => {
  const buildRepo = () => {
    const prisma = {
      riskScanState: {
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      position: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      userRiskState: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repo = new RiskRepository(prisma as unknown as PrismaService);
    return { repo, prisma };
  };

  describe('cursor codec', () => {
    it('round-trips estSeizableUsd and userId', () => {
      const encoded = encodeQueueCursor({
        estSeizableUsd: 1234.5,
        userId: 'u-1',
      });
      expect(decodeQueueCursor(encoded)).toEqual({
        estSeizableUsd: 1234.5,
        userId: 'u-1',
      });
    });

    it('returns null for garbage input', () => {
      expect(decodeQueueCursor('not-a-cursor')).toBeNull();
      expect(
        decodeQueueCursor(
          Buffer.from('{"wrong":"shape"}').toString('base64url'),
        ),
      ).toBeNull();
    });
  });

  it('queries liquidatable priced users with keyset ordering', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userRiskState.findMany.mockResolvedValue([]);

    await repo.getLiquidationQueuePage({ limit: 25 });

    expect(prisma.userRiskState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          band: 'liquidatable',
          riskStatus: 'priced',
        },
        orderBy: [{ estSeizableUsd: 'desc' }, { userId: 'asc' }],
        take: 26,
      }),
    );
  });

  it('applies minHealthFactor / minSeizableValue / asset filters', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userRiskState.findMany.mockResolvedValue([]);

    await repo.getLiquidationQueuePage({
      limit: 10,
      minHealthFactor: 0.5,
      minSeizableValue: 100,
      assetCode: 'XLM',
    });

    const calls = prisma.userRiskState.findMany.mock.calls as Array<
      Array<Record<string, unknown> | undefined>
    >;
    const call = calls[0]?.[0] as { where?: Record<string, unknown> };
    expect(call.where).toMatchObject({
      healthFactor: { gte: 0.5 },
      estSeizableUsd: { gte: 100 },
      user: {
        is: {
          positions: {
            some: {
              borrowedRaw: { gt: 0n },
              asset: { is: { code: 'XLM' } },
            },
          },
        },
      },
    });
  });

  it('uses the decoded cursor to continue after the last item of the previous page', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userRiskState.findMany.mockImplementation(
      ({ where }: { where: { OR?: unknown[] } }) =>
        // Simulate one row past the cursor so hasMore logic triggers.
        {
          void where;
          return Promise.resolve([
            {
              userId: 'u-2',
              band: 'liquidatable',
              healthFactor: 0.8,
              estSeizableUsd: 90,
              debtValueUsd: 100,
              collateralValueUsd: 80,
              maxRepayableUsd: 50,
              distanceToLiquidation: -0.2,
              priceMoveToLiquidation: 0,
              primaryDebtAssetId: 'a-1',
              updatedAt: new Date('2026-01-01T00:00:00Z'),
              user: { walletAddress: 'GU2' },
            },
            {
              userId: 'u-3',
              band: 'liquidatable',
              healthFactor: 0.7,
              estSeizableUsd: 70,
              debtValueUsd: 90,
              collateralValueUsd: 60,
              maxRepayableUsd: 45,
              distanceToLiquidation: -0.3,
              priceMoveToLiquidation: 0,
              primaryDebtAssetId: null,
              updatedAt: new Date('2026-01-01T00:00:00Z'),
              user: { walletAddress: 'GU3' },
            },
            {
              userId: 'u-4',
              band: 'liquidatable',
              healthFactor: 0.6,
              estSeizableUsd: 40,
              debtValueUsd: 50,
              collateralValueUsd: 30,
              maxRepayableUsd: 25,
              distanceToLiquidation: -0.4,
              priceMoveToLiquidation: 0,
              primaryDebtAssetId: null,
              updatedAt: new Date('2026-01-01T00:00:00Z'),
              user: { walletAddress: 'GU4' },
            },
          ]);
        },
    );

    const result = await repo.getLiquidationQueuePage({
      limit: 2,
      cursor: { estSeizableUsd: 999, userId: 'u-1' },
    });

    // Cursor predicate was passed through to the where clause.
    const calls = prisma.userRiskState.findMany.mock.calls as Array<
      Array<{ where?: { OR?: unknown } } | undefined>
    >;
    const firstCall = calls[0]?.[0] as { where?: { OR?: unknown } };
    expect(firstCall.where?.OR).toEqual([
      { estSeizableUsd: { lt: 999 } },
      { estSeizableUsd: 999, userId: { gt: 'u-1' } },
    ]);

    // Page limited to `limit` items; nextCursor encodes the last returned row.
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      userId: 'u-2',
      walletAddress: 'GU2',
      primaryDebtAssetCode: null,
    });
    expect(result.nextCursor).toBe(
      encodeQueueCursor({ estSeizableUsd: 70, userId: 'u-3' }),
    );
  });

  it('resolves primary debt asset codes in one batched lookup', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userRiskState.findMany.mockResolvedValue([
      {
        userId: 'u-2',
        band: 'liquidatable',
        healthFactor: 0.8,
        estSeizableUsd: 90,
        debtValueUsd: 100,
        collateralValueUsd: 80,
        maxRepayableUsd: 50,
        distanceToLiquidation: -0.2,
        priceMoveToLiquidation: 0,
        primaryDebtAssetId: 'asset-xlm',
        updatedAt: new Date(),
        user: { walletAddress: 'GU2' },
      },
    ]);
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-xlm', code: 'XLM' }]);

    const result = await repo.getLiquidationQueuePage({ limit: 10 });

    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['asset-xlm'] } },
      select: { id: true, code: true },
    });
    expect(result.items[0].primaryDebtAssetCode).toBe('XLM');
  });
});

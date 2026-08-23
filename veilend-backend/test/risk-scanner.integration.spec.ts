/**
 * Postgres-backed integration tests for the liquidation pipeline.
 *
 * Verifies against a real database — behaviour unit mocks cannot reproduce:
 *   - only ONE of two concurrent scanners claims the RiskScanState lease;
 *   - a processed `liquidate` event lands in LiquidationEvent, BOTH parties'
 *     TransactionHistory (BORROWER + LIQUIDATOR party roles), and adjusts the
 *     borrower's positions on both assets;
 *   - replays are idempotent;
 *   - the admin queue paginates deterministically via the keyset cursor.
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/veilend \
 *     npm run test:integration
 *
 * The schema is applied via `prisma db push` in beforeAll (mirroring
 * `prisma/schema.prisma` exactly), so a fresh, empty database is all that is
 * required.
 */
import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  IndexerRepository,
  IndexerTransaction,
} from '../src/indexer/indexer.repository';
import {
  RiskRepository,
  RISK_SCAN_STATE_ID,
} from '../src/risk/risk.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const DATABASE_URL = process.env.DATABASE_URL;

// Schema sync + first connections can be slow on cold starts.
jest.setTimeout(180_000);

// Skip (rather than fail) when no database is configured, so this file never
// breaks the default unit-test run that has no Postgres available.
const describeIfDb = DATABASE_URL ? describe : describe.skip;

const liquidationTx = (id: string): IndexerTransaction => ({
  id,
  userAddress: 'g-borrower',
  type: 'liquidation',
  assetAddress: 'c-debt',
  amount: '3000',
  ledger: 7,
  txHash: `tx-${id}`,
  timestamp: '2026-01-01T00:00:00.000Z',
});

const liquidationPayload = {
  liquidatorAddress: 'g-liquidator',
  borrowerAddress: 'g-borrower',
  debtAsset: 'c-debt',
  collateralAsset: 'c-coll',
  repaidRaw: 3000n,
  seizedRaw: 2500n,
  clipped: false,
  clippedByBps: null,
};

describeIfDb('Liquidation pipeline (Postgres integration)', () => {
  let prisma: PrismaClient;
  let indexerRepository: IndexerRepository;
  let riskRepository: RiskRepository;

  beforeAll(async () => {
    // Use the workspace prisma binary directly (npx resolution is slow and
    // can trip the hook timeout on cold caches).
    execSync(
      'node node_modules/prisma/build/index.js db push --skip-generate',
      {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: process.env,
      },
    );

    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$connect();

    indexerRepository = new IndexerRepository(
      prisma as unknown as PrismaService,
    );
    riskRepository = new RiskRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.userNotification.deleteMany();
    await prisma.transactionHistory.deleteMany();
    await prisma.liquidationEvent.deleteMany();
    // The event lookaside has a live TTL — stale entries from previous runs
    // would make every replay short-circuit as a duplicate.
    await prisma.indexerEventDedup.deleteMany();
    await prisma.userRiskState.deleteMany();
    await prisma.riskScanState.deleteMany().catch(() => undefined);
    await prisma.position.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('scanner lease (single-runner guarantee)', () => {
    it('lets only one of two concurrent scanners claim the lease', async () => {
      const claims = await Promise.all([
        riskRepository.claimScanLease('runner-a', 60_000),
        riskRepository.claimScanLease('runner-b', 60_000),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);

      // The loser cannot steal an unexpired lease either.
      const winner = claims[0] ? 'runner-a' : 'runner-b';
      const loser = claims[0] ? 'runner-b' : 'runner-a';
      await expect(riskRepository.claimScanLease(loser, 60_000)).resolves.toBe(
        false,
      );
      await expect(riskRepository.claimScanLease(winner, 60_000)).resolves.toBe(
        false,
      );

      const state = await prisma.riskScanState.findUnique({
        where: { id: RISK_SCAN_STATE_ID },
      });
      expect(state?.leaseOwner).toBe(winner);

      // Once released, someone else may claim.
      await riskRepository.finishScan(winner, {
        usersEvaluated: 3,
        positionsEvaluated: 5,
        notificationsSent: 1,
        unpricedCount: 0,
        durationMs: 42,
      });
      await expect(riskRepository.claimScanLease(loser, 60_000)).resolves.toBe(
        true,
      );
    });

    it('re-claims an EXPIRED lease left behind by a crashed replica', async () => {
      await riskRepository.claimScanLease('dead-runner', 50);
      await new Promise((r) => setTimeout(r, 80));
      await expect(
        riskRepository.claimScanLease('fresh-runner', 60_000),
      ).resolves.toBe(true);
    });
  });

  describe('liquidation event processing', () => {
    let borrowerId: string;
    let liquidatorId: string;
    let debtAssetId: string;
    let collateralAssetId: string;

    beforeEach(async () => {
      const borrower = await prisma.user.create({
        data: { walletAddress: 'g-borrower' },
      });
      const liquidator = await prisma.user.create({
        data: { walletAddress: 'g-liquidator' },
      });
      const debtAsset = await prisma.asset.create({
        data: {
          contractId: 'c-debt',
          code: 'USDC',
          symbol: 'USDC',
          name: 'USDC',
          decimals: 6,
          isSupported: true,
        },
      });
      const collateralAsset = await prisma.asset.create({
        data: {
          contractId: 'c-coll',
          code: 'XLM',
          symbol: 'XLM',
          name: 'Stellar Lumens',
          decimals: 7,
          isSupported: true,
        },
      });
      await prisma.position.create({
        data: {
          userId: borrower.id,
          assetId: debtAsset.id,
          depositedRaw: 0n,
          borrowedRaw: 5000n,
          isStale: false,
        },
      });
      await prisma.position.create({
        data: {
          userId: borrower.id,
          assetId: collateralAsset.id,
          depositedRaw: 3000n,
          borrowedRaw: 0n,
          isStale: false,
        },
      });

      borrowerId = borrower.id;
      liquidatorId = liquidator.id;
      debtAssetId = debtAsset.id;
      collateralAssetId = collateralAsset.id;
    });

    it('writes the read-model row, both parties history rows, and adjusts both borrower positions', async () => {
      const result = await indexerRepository.processEventSafe({
        tx: liquidationTx('liq-1'),
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: liquidationPayload,
      });
      expect(result.isNew).toBe(true);

      const liqRow = await prisma.liquidationEvent.findUnique({
        where: { sorobanEventId: 'liq-1' },
      });
      expect(liqRow).toMatchObject({
        borrowerAddress: 'g-borrower',
        liquidatorAddress: 'g-liquidator',
        debtAssetId,
        collateralAssetId,
        repaidRaw: 3000n,
        seizedRaw: 2500n,
        badDebt: false,
        clipped: false,
      });

      const historyRows = await prisma.transactionHistory.findMany({
        where: { txHash: 'tx-liq-1' },
        orderBy: { partyRole: 'asc' },
      });
      expect(historyRows).toHaveLength(2);
      const borrowerRow = historyRows.find((r) => r.userId === borrowerId);
      const liquidatorRow = historyRows.find((r) => r.userId === liquidatorId);
      expect(borrowerRow).toMatchObject({
        partyRole: 'BORROWER',
        assetId: debtAssetId,
        amountRaw: 3000n,
        sorobanEventId: 'liq-1',
      });
      expect(liquidatorRow).toMatchObject({
        partyRole: 'LIQUIDATOR',
        assetId: collateralAssetId,
        amountRaw: 2500n,
        sorobanEventId: 'liq-1:liq',
      });

      const debtPosition = await prisma.position.findUnique({
        where: { userId_assetId: { userId: borrowerId, assetId: debtAssetId } },
      });
      const collateralPosition = await prisma.position.findUnique({
        where: {
          userId_assetId: { userId: borrowerId, assetId: collateralAssetId },
        },
      });
      expect(debtPosition?.borrowedRaw).toBe(2000n); // 5000 − 3000
      expect(collateralPosition?.depositedRaw).toBe(500n); // 3000 − 2500
    });

    it('is idempotent under replay: second write is a no-op', async () => {
      await indexerRepository.processEventSafe({
        tx: liquidationTx('liq-replay'),
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: liquidationPayload,
      });
      const second = await indexerRepository.processEventSafe({
        tx: liquidationTx('liq-replay'),
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: liquidationPayload,
      });

      expect(second.isNew).toBe(false);
      expect(await prisma.liquidationEvent.count()).toBe(1);
      expect(await prisma.transactionHistory.count()).toBe(2);
      // Balances unchanged by the replay.
      const collateralPosition = await prisma.position.findUnique({
        where: {
          userId_assetId: { userId: borrowerId, assetId: collateralAssetId },
        },
      });
      expect(collateralPosition?.depositedRaw).toBe(500n);
    });

    it('flags badDebt when seizure exhausts collateral while debt remains', async () => {
      await indexerRepository.processEventSafe({
        tx: liquidationTx('liq-bad'),
        depositedDelta: 0n,
        borrowedDelta: 0n,
        liquidation: { ...liquidationPayload, seizedRaw: 3500n },
      });

      const row = await prisma.liquidationEvent.findUnique({
        where: { sorobanEventId: 'liq-bad' },
      });
      expect(row?.badDebt).toBe(true);

      const collateralPosition = await prisma.position.findUnique({
        where: {
          userId_assetId: { userId: borrowerId, assetId: collateralAssetId },
        },
      });
      expect(collateralPosition?.depositedRaw).toBe(0n); // clamped
    });
  });

  describe('admin liquidation queue pagination', () => {
    it('pages deterministically by estSeizableUsd desc with the keyset cursor', async () => {
      const users = ['g-q1', 'g-q2', 'g-q3'];
      for (const wallet of users) {
        const user = await prisma.user.create({
          data: { walletAddress: wallet },
        });
        await prisma.userRiskState.create({
          data: {
            userId: user.id,
            band: 'liquidatable',
            riskStatus: 'priced',
            healthFactor: 0.9,
            estSeizableUsd:
              wallet === 'g-q1' ? 100 : wallet === 'g-q2' ? 90 : 70,
            debtValueUsd: 500,
            collateralValueUsd: 400,
            maxRepayableUsd: 250,
            lastEvaluatedBand: 'liquidatable',
            lastEvaluatedAt: new Date(),
          },
        });
      }
      // A healthy user must never appear.
      const healthy = await prisma.user.create({
        data: { walletAddress: 'g-healthy' },
      });
      await prisma.userRiskState.create({
        data: {
          userId: healthy.id,
          band: 'healthy',
          lastEvaluatedAt: new Date(),
        },
      });

      const page1 = await riskRepository.getLiquidationQueuePage({ limit: 2 });
      expect(page1.items.map((i) => i.walletAddress)).toEqual(['g-q1', 'g-q2']);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await riskRepository.getLiquidationQueuePage({
        limit: 2,
        cursor: decodeNext(page1.nextCursor),
      });
      expect(page2.items.map((i) => i.walletAddress)).toEqual(['g-q3']);
      expect(page2.nextCursor).toBeNull();

      function decodeNext(cursor: string | null) {
        if (!cursor) return undefined;
        const parsed = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as { estSeizableUsd: number; userId: string };
        return parsed;
      }
    });
  });
});

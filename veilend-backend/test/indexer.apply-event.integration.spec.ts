/**
 * Postgres-backed integration tests for IndexerRepository.applyEvent.
 *
 * These verify the concurrency guarantees from issue #257 against a real
 * database (row-level locking, atomic dedup + delta update, rollback on
 * failure) — behaviour that unit-test mocks cannot reproduce.
 *
 * Run with:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/veilend npm run test:integration
 *
 * The schema is applied via `prisma db push` in beforeAll (mirroring
 * `prisma/schema.prisma` exactly, which is what the generated client expects),
 * so a fresh, empty database is all that is required.
 */
import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  IndexerRepository,
  IndexerTransaction,
} from '../src/indexer/indexer.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const DATABASE_URL = process.env.DATABASE_URL;

// Skip (rather than fail) when no database is configured, so this file never
// breaks the default unit-test run that has no Postgres available.
const describeIfDb = DATABASE_URL ? describe : describe.skip;

const BIGINT_MAX = 9223372036854775807n;

describeIfDb('IndexerRepository.applyEvent (Postgres integration)', () => {
  let prisma: PrismaClient;
  let repository: IndexerRepository;

  const event = (
    id: string,
    userAddress = 'g-user',
    assetAddress = 'c-asset',
    amount = '100',
  ): IndexerTransaction => ({
    id,
    userAddress,
    type: 'deposit',
    assetAddress,
    amount,
    ledger: 1,
    txHash: `tx-${id}`,
    timestamp: '2026-01-01T00:00:00.000Z',
  });

  const readPosition = async (userAddress: string, assetAddress: string) => {
    const user = await prisma.user.findUnique({
      where: { walletAddress: userAddress.toLowerCase() },
    });
    const asset = await prisma.asset.findUnique({
      where: { contractId: assetAddress.toLowerCase() },
    });
    if (!user || !asset) return null;
    return prisma.position.findUnique({
      where: { userId_assetId: { userId: user.id, assetId: asset.id } },
    });
  };

  beforeAll(async () => {
    // Sync the schema to the target database (idempotent).
    execSync('npx prisma db push --skip-generate', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });

    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$connect();

    repository = new IndexerRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Children first, then their referenced User/Asset parents.
    await prisma.transactionHistory.deleteMany();
    await prisma.position.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.user.deleteMany();
  });

  it('lost-update regression: two concurrent 100n deposits sum to 200n', async () => {
    // Seed a starting position at 0 so the concurrent writers hit an existing
    // row and must serialize on the FOR UPDATE lock.
    const user = await prisma.user.upsert({
      where: { walletAddress: 'g-user' },
      create: { walletAddress: 'g-user' },
      update: {},
    });
    const asset = await prisma.asset.upsert({
      where: { contractId: 'c-asset' },
      create: {
        contractId: 'c-asset',
        code: 'c-asset',
        symbol: 'c-asset',
        name: 'c-asset',
        isSupported: false,
      },
      update: {},
    });
    await prisma.position.create({
      data: {
        userId: user.id,
        assetId: asset.id,
        depositedRaw: 0n,
        borrowedRaw: 0n,
        isStale: false,
      },
    });

    const results = await Promise.all([
      repository.applyEvent(event('evt-a', 'g-user', 'c-asset'), 100n, 0n),
      repository.applyEvent(event('evt-b', 'g-user', 'c-asset'), 100n, 0n),
    ]);

    expect(results.sort()).toEqual([true, true]);

    const position = await readPosition('g-user', 'c-asset');
    expect(position?.depositedRaw).toBe(200n);
  });

  it('duplicate-event: same sorobanEventId twice is counted once and returns [true, false]', async () => {
    const results = await Promise.all([
      repository.applyEvent(event('evt-dup'), 100n, 0n),
      repository.applyEvent(event('evt-dup'), 100n, 0n),
    ]);

    expect(results.sort()).toEqual([false, true]);

    const position = await readPosition('g-user', 'c-asset');
    expect(position?.depositedRaw).toBe(100n);

    expect(
      await prisma.transactionHistory.count({
        where: { sorobanEventId: 'evt-dup' },
      }),
    ).toBe(1);
  });

  it('failure: a mid-transaction error persists neither the row nor the delta', async () => {
    // Seed a position at BIGINT max so the +1 deposit overflows in the
    // Position UPDATE, failing after the TransactionHistory insert has already
    // executed inside the same transaction.
    const user = await prisma.user.upsert({
      where: { walletAddress: 'g-fail' },
      create: { walletAddress: 'g-fail' },
      update: {},
    });
    const asset = await prisma.asset.upsert({
      where: { contractId: 'c-fail' },
      create: {
        contractId: 'c-fail',
        code: 'c-fail',
        symbol: 'c-fail',
        name: 'c-fail',
        isSupported: false,
      },
      update: {},
    });
    await prisma.position.create({
      data: {
        userId: user.id,
        assetId: asset.id,
        depositedRaw: BIGINT_MAX,
        borrowedRaw: 0n,
        isStale: false,
      },
    });

    await expect(
      repository.applyEvent(event('evt-fail', 'g-fail', 'c-fail', '1'), 1n, 0n),
    ).rejects.toThrow();

    expect(
      await prisma.transactionHistory.count({
        where: { sorobanEventId: 'evt-fail' },
      }),
    ).toBe(0);

    const position = await readPosition('g-fail', 'c-fail');
    expect(position?.depositedRaw).toBe(BIGINT_MAX);
  });
});

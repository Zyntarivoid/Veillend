import { randomUUID } from 'crypto';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IndexerCheckpoint {
  lastIndexedLedger: number;
}

export interface IndexerTransaction {
  id: string;
  userAddress: string;
  type: 'deposit' | 'borrow' | 'repay' | 'withdraw';
  assetAddress: string;
  amount: string; // i128 values represented as strings to preserve precision
  ledger: number;
  txHash: string;
  timestamp: string;
}

export interface GetTransactionsOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedIndexerTransactions {
  transactions: IndexerTransaction[];
  nextCursor: string | null;
}

export interface IndexerPosition {
  userAddress: string;
  assetAddress: string;
  deposited: string;
  borrowed: string;
  updatedAt: string;
}

export interface IndexerAsset {
  assetAddress: string;
  supported: boolean;
  updatedAt: string;
}

const TX_TYPE_MAP: Record<IndexerTransaction['type'], TransactionType> = {
  deposit: TransactionType.DEPOSIT,
  borrow: TransactionType.BORROW,
  repay: TransactionType.REPAY,
  withdraw: TransactionType.WITHDRAW,
};

const TX_TYPE_REVERSE_MAP: Record<TransactionType, IndexerTransaction['type']> =
  {
    DEPOSIT: 'deposit',
    BORROW: 'borrow',
    REPAY: 'repay',
    WITHDRAW: 'withdraw',
    LIQUIDATION: 'withdraw', // indexer never produces this today; kept exhaustive for the enum
  };

/**
 * True when an error is a Prisma unique-constraint violation (P2002).
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

const CHECKPOINT_ID = 'global';

@Injectable()
export class IndexerRepository {
  private readonly logger = new Logger(IndexerRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalize(address: string): string {
    return address.toLowerCase();
  }

  /**
   * Get-or-create the User row backing a wallet address, so Position/
   * TransactionHistory rows always have a valid userId FK even if the
   * wallet has never called /auth/verify.
   */
  private async resolveUser(
    db: Prisma.TransactionClient,
    walletAddress: string,
  ) {
    const normalized = this.normalize(walletAddress);
    return db.user.upsert({
      where: { walletAddress: normalized },
      create: { walletAddress: normalized },
      update: {},
    });
  }

  /**
   * Get-or-create the Asset row backing a Soroban contract address. The
   * indexer only knows the contract address at index time, not real token
   * metadata (code/symbol/name) — those are placeholder values until a
   * real admin asset-configuration flow exists to fill them in.
   */
  private async resolveAsset(
    db: Prisma.TransactionClient,
    assetAddress: string,
  ) {
    const normalized = this.normalize(assetAddress);
    return db.asset.upsert({
      where: { contractId: normalized },
      create: {
        contractId: normalized,
        code: normalized,
        symbol: normalized,
        name: normalized,
        isSupported: false,
      },
      update: {},
    });
  }

  async getCheckpoint(): Promise<IndexerCheckpoint> {
    const row = await this.prisma.indexerCheckpoint.findUnique({
      where: { id: CHECKPOINT_ID },
    });
    return { lastIndexedLedger: row?.lastIndexedLedger ?? 0 };
  }

  async saveCheckpoint(ledger: number): Promise<void> {
    await this.prisma.indexerCheckpoint.upsert({
      where: { id: CHECKPOINT_ID },
      create: { id: CHECKPOINT_ID, lastIndexedLedger: ledger },
      update: { lastIndexedLedger: ledger },
    });
  }

  async getTransactions(userAddress: string): Promise<IndexerTransaction[]> {
    const normalized = this.normalize(userAddress);
    const rows = await this.prisma.transactionHistory.findMany({
      where: { user: { walletAddress: normalized } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.sorobanEventId ?? row.id,
      userAddress,
      type: TX_TYPE_REVERSE_MAP[row.type],
      assetAddress: row.contractId ?? '',
      amount: row.amountRaw.toString(),
      ledger: row.ledgerSequence ?? 0,
      txHash: row.txHash ?? '',
      timestamp: row.createdAt.toISOString(),
    }));
  }

  async getTransactionsForUser(
    userAddress: string,
    options?: GetTransactionsOptions,
  ): Promise<PaginatedIndexerTransactions> {
    const normalized = this.normalize(userAddress);
    const limit =
      typeof options?.limit === 'number' && !isNaN(options.limit)
        ? Math.min(Math.max(Math.floor(options.limit), 1), 200)
        : 50;

    let cursorPayload: { timestamp: string; id: string } | null = null;
    if (options?.cursor) {
      try {
        const json = Buffer.from(options.cursor, 'base64').toString('utf8');
        const parsed = JSON.parse(json) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          'timestamp' in parsed &&
          'id' in parsed &&
          typeof (parsed as Record<string, unknown>).timestamp === 'string' &&
          typeof (parsed as Record<string, unknown>).id === 'string' &&
          !isNaN(
            Date.parse((parsed as Record<string, unknown>).timestamp as string),
          )
        ) {
          cursorPayload = parsed as { timestamp: string; id: string };
        } else {
          throw new Error('Invalid cursor payload structure');
        }
      } catch {
        throw new BadRequestException('Invalid cursor');
      }
    }

    const cursorDate = cursorPayload ? new Date(cursorPayload.timestamp) : null;

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        user: { walletAddress: normalized },
        ...(cursorPayload && cursorDate
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                {
                  createdAt: cursorDate,
                  id: { gt: cursorPayload.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      const cursorObj = {
        timestamp: lastRow.createdAt.toISOString(),
        id: lastRow.id,
      };
      nextCursor = Buffer.from(JSON.stringify(cursorObj), 'utf8').toString(
        'base64',
      );
    }

    const transactions: IndexerTransaction[] = pageRows.map((row) => ({
      id: row.sorobanEventId ?? row.id,
      userAddress,
      type: TX_TYPE_REVERSE_MAP[row.type],
      assetAddress: row.contractId ?? '',
      amount: row.amountRaw.toString(),
      ledger: row.ledgerSequence ?? 0,
      txHash: row.txHash ?? '',
      timestamp: row.createdAt.toISOString(),
    }));

    return { transactions, nextCursor };
  }

  /**
   * Atomically applies a single indexed event: dedupes on the event's
   * sorobanEventId, inserts the TransactionHistory row, and applies the
   * Position delta in ONE database transaction.
   *
   * Returns `true` when this call newly indexed the event (and updated the
   * position); returns `false` when the event's sorobanEventId was already
   * indexed (duplicate delivery/replay), in which case nothing is written.
   *
   * The Position read-modify-write acquires a row-level lock (SELECT … FOR
   * UPDATE) so concurrent writers on the same (user, asset) cannot lose
   * deltas.
   */
  async applyEvent(
    tx: IndexerTransaction,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<boolean> {
    const timestamp = new Date(tx.timestamp);
    let isNew = false;

    try {
      await this.prisma.$transaction(async (db) => {
        const existing = await db.transactionHistory.findUnique({
          where: { sorobanEventId: tx.id },
        });
        if (existing) {
          // Duplicate delivery/replay: do not double-count balances.
          return;
        }

        const user = await this.resolveUser(db, tx.userAddress);
        const asset = await this.resolveAsset(db, tx.assetAddress);

        await db.transactionHistory.create({
          data: {
            userId: user.id,
            assetId: asset.id,
            type: TX_TYPE_MAP[tx.type],
            // Indexed events are already-confirmed on-chain activity.
            status: TransactionStatus.CONFIRMED,
            amountRaw: BigInt(tx.amount),
            // No price-oracle integration exists yet anywhere in the codebase;
            // defaulted to 0 pending that separate, unscoped effort.
            amountUsd: 0,
            txHash: tx.txHash || null,
            ledgerSequence: tx.ledger,
            contractId: this.normalize(tx.assetAddress),
            sorobanEventId: tx.id,
            createdAt: timestamp,
            confirmedAt: timestamp,
          },
        });

        await this.applyPositionDelta(
          db,
          user.id,
          asset.id,
          depositedDelta,
          borrowedDelta,
        );

        isNew = true;
      });
    } catch (error) {
      // Race: another writer committed the same sorobanEventId between our
      // existence check and this create. The whole transaction rolls back, so
      // neither the TransactionHistory row nor the Position delta survives.
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }

    return isNew;
  }

  /**
   * Applies deltas to a user's position for one asset under a row-level lock,
   * clamping balances to a minimum of 0. The ensure-exists insert + SELECT …
   * FOR UPDATE + UPDATE sequence is safe under concurrency: concurrent
   * writers on the same (user, asset) serialize on the row lock and therefore
   * cannot lose each other's deltas.
   */
  private async applyPositionDelta(
    db: Prisma.TransactionClient,
    userId: string,
    assetId: string,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<void> {
    // Ensure the row exists so the FOR UPDATE lock below is taken on a real
    // row even for brand-new positions (idempotent; concurrent callers race
    // benignly on the unique index).
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "Position" ("id", "userId", "assetId", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, ${assetId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "assetId") DO NOTHING
    `);

    // Row-level lock: serialize concurrent read-modify-writes on this
    // (user, asset) pair.
    const rows = await db.$queryRaw<
      Array<{ depositedRaw: bigint; borrowedRaw: bigint }>
    >(Prisma.sql`
      SELECT "depositedRaw", "borrowedRaw"
      FROM "Position"
      WHERE "userId" = ${userId} AND "assetId" = ${assetId}
      FOR UPDATE
    `);

    const currentDeposited = BigInt(rows[0]?.depositedRaw ?? 0n);
    const currentBorrowed = BigInt(rows[0]?.borrowedRaw ?? 0n);

    let nextDeposited = currentDeposited + depositedDelta;
    let nextBorrowed = currentBorrowed + borrowedDelta;

    if (nextDeposited < 0n) nextDeposited = 0n;
    if (nextBorrowed < 0n) nextBorrowed = 0n;

    await db.$executeRaw(Prisma.sql`
      UPDATE "Position"
      SET "depositedRaw" = ${nextDeposited},
          "borrowedRaw" = ${nextBorrowed},
          "isStale" = false,
          "lastSyncAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "assetId" = ${assetId}
    `);
  }

  async getPositions(userAddress: string): Promise<IndexerPosition[]> {
    const normalized = this.normalize(userAddress);
    const rows = await this.prisma.position.findMany({
      where: { user: { walletAddress: normalized } },
      include: { asset: true },
    });
    return rows.map((row) => ({
      userAddress,
      assetAddress: row.asset.contractId ?? '',
      deposited: row.depositedRaw.toString(),
      borrowed: row.borrowedRaw.toString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getAssets(): Promise<IndexerAsset[]> {
    const rows = await this.prisma.asset.findMany({
      where: { contractId: { not: null } },
    });
    return rows.map((row) => ({
      assetAddress: row.contractId ?? '',
      supported: row.isSupported,
      updatedAt: row.createdAt.toISOString(),
    }));
  }

  async setAssetSupported(
    assetAddress: string,
    supported: boolean,
  ): Promise<void> {
    const normalized = this.normalize(assetAddress);
    await this.prisma.asset.upsert({
      where: { contractId: normalized },
      create: {
        contractId: normalized,
        code: normalized,
        symbol: normalized,
        name: normalized,
        isSupported: supported,
      },
      update: { isSupported: supported },
    });
  }

  /**
   * Clears indexer-owned read models (positions, indexed transactions, the
   * ledger checkpoint) so a replay can rebuild them from scratch. Unlike the
   * old JSON-file store, these tables are shared with other subsystems
   * (User/Asset rows may also come from auth/admin), so this intentionally
   * does NOT wipe Users, Assets, Sessions, or Admins — only rows the
   * indexer itself produces.
   */
  async resetDatabase(): Promise<void> {
    this.logger.log('Resetting indexer database read models (for replay)...');
    await this.prisma.$transaction([
      this.prisma.transactionHistory.deleteMany({
        where: { sorobanEventId: { not: null } },
      }),
      this.prisma.position.deleteMany({}),
      this.prisma.indexerCheckpoint.deleteMany({
        where: { id: CHECKPOINT_ID },
      }),
    ]);
  }
}

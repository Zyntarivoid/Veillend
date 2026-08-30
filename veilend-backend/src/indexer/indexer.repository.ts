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
  eventIndex?: number;
  timestamp: string;
}

export type IndexerParsedEvent =
  | {
      kind: 'transaction';
      tx: IndexerTransaction;
      depositedDelta: bigint;
      borrowedDelta: bigint;
    }
  | {
      kind: 'interest_accrued';
      assetAddress: string;
      borrowIndex: string;
      supplyIndex: string;
      accruedAmount: string; // interest to borrowers
      reserveShare: string; // dust to reserves
      ledger: number;
      timestamp: string;
      eventId: string;
      txHash: string;
      eventIndex: number;
    }
  | {
      kind: 'asset_reserve_updated';
      assetAddress: string;
      totalBalance: string;
      protocolFees: string;
      updateKind: string;
      ledger: number;
      timestamp: string;
      eventId: string;
      txHash: string;
      eventIndex: number;
    }
  | {
      kind: 'interest_params_updated';
      assetAddress: string;
      baseRateBps: number;
      kinkUtilBps: number;
      slope1Bps: number;
      slope2Bps: number;
      reserveFactorBps: number;
      ledger: number;
      timestamp: string;
      eventId: string;
      txHash: string;
      eventIndex: number;
    };

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

/**
 * Derives a deterministic integer eventIndex from the event ID if not explicitly provided.
 */
export function extractEventIndex(eventId: string): number {
  if (!eventId) return 0;
  const parts = eventId.split('-');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart, 10);
    if (!isNaN(num)) return num;
  }
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = (hash * 31 + eventId.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
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

  async getCheckpoint(
    db?: Prisma.TransactionClient,
  ): Promise<IndexerCheckpoint> {
    const client = db ?? this.prisma;
    const row = await client.indexerCheckpoint.findUnique({
      where: { id: CHECKPOINT_ID },
    });
    return { lastIndexedLedger: row?.lastIndexedLedger ?? 0 };
  }

  async saveCheckpoint(
    ledger: number,
    db?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = db ?? this.prisma;
    await client.indexerCheckpoint.upsert({
      where: { id: CHECKPOINT_ID },
      create: { id: CHECKPOINT_ID, lastIndexedLedger: ledger },
      update: { lastIndexedLedger: ledger },
    });
  }

  /**
   * Checks if an event is a duplicate using the IndexerEventDedup lookaside table
   * or existing TransactionHistory rows before inserting.
   */
  async isEventDuplicate(
    eventId: string,
    txHash?: string,
    eventIndex?: number,
    db?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = db ?? this.prisma;

    // 1. Check lookaside table (with active TTL)
    const dedupEntry = await client.indexerEventDedup.findUnique({
      where: { eventId },
    });
    if (dedupEntry && dedupEntry.expiresAt > new Date()) {
      return true;
    }

    // 2. Check TransactionHistory
    const orConditions: Prisma.TransactionHistoryWhereInput[] = [
      { sorobanEventId: eventId },
    ];
    if (txHash && eventIndex !== undefined) {
      orConditions.push({ txHash, eventIndex });
    }

    const existingTx = await client.transactionHistory.findFirst({
      where: { OR: orConditions },
    });

    return Boolean(existingTx);
  }

  /**
   * Records an event in the IndexerEventDedup lookaside table with short TTL (e.g. 1 hour).
   */
  async recordEventDedup(
    eventId: string,
    txHash?: string,
    eventIndex?: number,
    ledger?: number,
    ttlSeconds = 3600,
    db?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = db ?? this.prisma;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await client.indexerEventDedup.upsert({
      where: { eventId },
      create: {
        eventId,
        txHash: txHash || null,
        eventIndex: eventIndex !== undefined ? eventIndex : null,
        ledger: ledger !== undefined ? ledger : null,
        expiresAt,
      },
      update: {
        expiresAt,
        txHash: txHash || null,
        eventIndex: eventIndex !== undefined ? eventIndex : null,
        ledger: ledger !== undefined ? ledger : null,
      },
    });
  }

  /**
   * Cleans up expired deduplication lookaside records.
   */
  async cleanExpiredDedup(db?: Prisma.TransactionClient): Promise<number> {
    const client = db ?? this.prisma;
    const result = await client.indexerEventDedup.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
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
      eventIndex: row.eventIndex ?? undefined,
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
      eventIndex: row.eventIndex ?? undefined,
      timestamp: row.createdAt.toISOString(),
    }));

    return { transactions, nextCursor };
  }

  /**
   * Atomically and idempotently processes a single indexed event:
   * 1. Checks lookaside table and DB for duplicate events before writing.
   * 2. Resolves User and Asset FKs.
   * 3. Creates the TransactionHistory row.
   * 4. Updates Position balance under a row-level lock (FOR UPDATE).
   * 5. Records event in the IndexerEventDedup lookaside table.
   *
   * Returns `{ isNew: true }` if newly indexed; `{ isNew: false }` if skipped duplicate.
   */
  async processEventSafe(
    event: IndexerParsedEvent,
    db?: Prisma.TransactionClient,
  ): Promise<{ isNew: boolean }> {
    const execute = async (client: Prisma.TransactionClient) => {
      let eventId = '';
      let txHash = '';
      let eventIndex = 0;
      let ledger = 0;
      let timestampStr = '';

      if (event.kind === 'transaction') {
        eventId = event.tx.id;
        txHash = event.tx.txHash;
        eventIndex = event.tx.eventIndex ?? extractEventIndex(eventId);
        ledger = event.tx.ledger;
        timestampStr = event.tx.timestamp;
      } else {
        eventId = event.eventId;
        txHash = event.txHash;
        eventIndex = event.eventIndex;
        ledger = event.ledger;
        timestampStr = event.timestamp;
      }
      const timestamp = new Date(timestampStr);

      // 1. Lookaside + DB deduplication check
      const isDup = await this.isEventDuplicate(
        eventId,
        txHash,
        eventIndex,
        client,
      );
      if (isDup) {
        return { isNew: false };
      }

      try {
        if (event.kind === 'transaction') {
          const { tx, depositedDelta, borrowedDelta } = event;
          const user = await this.resolveUser(client, tx.userAddress);
          const asset = await this.resolveAsset(client, tx.assetAddress);

          await client.transactionHistory.create({
            data: {
              userId: user.id,
              assetId: asset.id,
              type: TX_TYPE_MAP[tx.type],
              status: TransactionStatus.CONFIRMED,
              amountRaw: BigInt(tx.amount),
              amountUsd: 0,
              txHash: tx.txHash || null,
              eventIndex,
              ledgerSequence: tx.ledger,
              contractId: this.normalize(tx.assetAddress),
              sorobanEventId: tx.id,
              createdAt: timestamp,
              confirmedAt: timestamp,
            },
          });

          await this.applyPositionDelta(
            client,
            user.id,
            asset.id,
            depositedDelta,
            borrowedDelta,
          );
        } else if (event.kind === 'interest_accrued') {
          const asset = await this.resolveAsset(client, event.assetAddress);
          const accruedAmount = BigInt(event.accruedAmount);
          const reserveShare = BigInt(event.reserveShare);

          await client.$executeRaw(Prisma.sql`
            INSERT INTO "AssetInterestState" ("assetId", "borrowIndex", "supplyIndex", "lastAccrualLedger", "lastAccrualAt", "totalSupplied", "totalBorrowed", "updatedAt")
            VALUES (${asset.id}, ${event.borrowIndex}::numeric, ${event.supplyIndex}::numeric, ${event.ledger}, ${timestamp}, 0, 0, CURRENT_TIMESTAMP)
            ON CONFLICT ("assetId") DO UPDATE SET
              "borrowIndex" = ${event.borrowIndex}::numeric,
              "supplyIndex" = ${event.supplyIndex}::numeric,
              "lastAccrualLedger" = ${event.ledger},
              "lastAccrualAt" = ${timestamp},
              "totalBorrowed" = "AssetInterestState"."totalBorrowed" + ${accruedAmount},
              "totalSupplied" = "AssetInterestState"."totalSupplied" + (${accruedAmount} - ${reserveShare}),
              "updatedAt" = CURRENT_TIMESTAMP
          `);
        } else if (event.kind === 'asset_reserve_updated') {
          const asset = await this.resolveAsset(client, event.assetAddress);
          await client.$executeRaw(Prisma.sql`
            INSERT INTO "AssetInterestState" ("assetId", "protocolFees", "updatedAt")
            VALUES (${asset.id}, ${BigInt(event.protocolFees)}, CURRENT_TIMESTAMP)
            ON CONFLICT ("assetId") DO UPDATE SET
              "protocolFees" = ${BigInt(event.protocolFees)},
              "updatedAt" = CURRENT_TIMESTAMP
          `);
        } else if (event.kind === 'interest_params_updated') {
          const asset = await this.resolveAsset(client, event.assetAddress);
          await client.assetInterestParams.upsert({
            where: { assetId: asset.id },
            create: {
              assetId: asset.id,
              baseRateBps: event.baseRateBps,
              kinkUtilBps: event.kinkUtilBps,
              slope1Bps: event.slope1Bps,
              slope2Bps: event.slope2Bps,
              reserveFactorBps: event.reserveFactorBps,
            },
            update: {
              baseRateBps: event.baseRateBps,
              kinkUtilBps: event.kinkUtilBps,
              slope1Bps: event.slope1Bps,
              slope2Bps: event.slope2Bps,
              reserveFactorBps: event.reserveFactorBps,
            },
          });
        }

        // Record in lookaside table for fast subsequent dedup
        await this.recordEventDedup(
          eventId,
          txHash,
          eventIndex,
          ledger,
          3600,
          client,
        );

        return { isNew: true };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return { isNew: false };
        }
        throw error;
      }
    };

    if (db) {
      return execute(db);
    }

    return this.prisma.$transaction(execute);
  }

  /**
   * Applies all parsed events for a chunk and updates the ledger checkpoint
   * within a SINGLE atomic Prisma transaction. If killed or failed mid-chunk,
   * the entire chunk rolls back and the checkpoint remains at the previous boundary.
   */
  async processChunk(
    events: IndexerParsedEvent[],
    chunkEndLedger: number,
  ): Promise<{ inserted: number; alreadyProcessed: number }> {
    return this.prisma.$transaction(async (tx) => {
      let inserted = 0;
      let alreadyProcessed = 0;

      for (const item of events) {
        const result = await this.processEventSafe(item, tx);
        if (result.isNew) {
          inserted++;
        } else {
          alreadyProcessed++;
        }
      }

      if (chunkEndLedger > 0) {
        await this.saveCheckpoint(chunkEndLedger, tx);
      }

      return { inserted, alreadyProcessed };
    });
  }

  /**
   * Backward-compatible helper for applying a single event.
   */
  async applyEvent(
    tx: IndexerTransaction,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<boolean> {
    const result = await this.processEventSafe({
      kind: 'transaction',
      tx,
      depositedDelta,
      borrowedDelta,
    });
    return result.isNew;
  }

  /**
   * Applies deltas to a user's position for one asset under a row-level lock,
   * clamping balances to a minimum of 0.
   */
  private async applyPositionDelta(
    db: Prisma.TransactionClient,
    userId: string,
    assetId: string,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<void> {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "Position" ("id", "userId", "assetId", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, ${assetId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "assetId") DO NOTHING
    `);

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

    // Fetch current indexes to re-anchor snapshots
    const stateRows = await db.$queryRaw<
      Array<{ borrowIndex: Prisma.Decimal; supplyIndex: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "borrowIndex", "supplyIndex"
      FROM "AssetInterestState"
      WHERE "assetId" = ${assetId}
    `);
    const currentBorrowIndex =
      stateRows[0]?.borrowIndex ?? new Prisma.Decimal(1.0);
    const currentSupplyIndex =
      stateRows[0]?.supplyIndex ?? new Prisma.Decimal(1.0);

    let nextDeposited = currentDeposited + depositedDelta;
    let nextBorrowed = currentBorrowed + borrowedDelta;

    if (nextDeposited < 0n) nextDeposited = 0n;
    if (nextBorrowed < 0n) nextBorrowed = 0n;

    await db.$executeRaw(Prisma.sql`
      UPDATE "Position"
      SET "depositedRaw" = ${nextDeposited},
          "borrowedRaw" = ${nextBorrowed},
          "borrowIndexSnapshot" = ${currentBorrowIndex}::numeric,
          "supplyIndexSnapshot" = ${currentSupplyIndex}::numeric,
          "isStale" = false,
          "lastSyncAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "assetId" = ${assetId}
    `);

    // We also need to update totalSupplied and totalBorrowed on AssetInterestState
    // based on user transactions (since interest_accrued only covers interest growth)
    if (depositedDelta !== 0n || borrowedDelta !== 0n) {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "AssetInterestState" ("assetId", "updatedAt")
        VALUES (${assetId}, CURRENT_TIMESTAMP)
        ON CONFLICT ("assetId") DO UPDATE SET
          "totalSupplied" = "AssetInterestState"."totalSupplied" + ${depositedDelta},
          "totalBorrowed" = "AssetInterestState"."totalBorrowed" + ${borrowedDelta},
          "updatedAt" = CURRENT_TIMESTAMP
      `);
    }
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
   * Clears indexer-owned read models (positions, indexed transactions, checkpoints,
   * and dedup lookaside rows) so a replay can rebuild them from scratch.
   *
   * @param scope - 'full' deletes all rows, 'bad-only' (default) only deletes rows newer than checkpoint
   */
  async resetDatabase(scope: 'full' | 'bad-only' = 'bad-only'): Promise<void> {
    this.logger.log(
      `Resetting indexer database read models (for replay)... scope: ${scope}`,
    );

    if (scope === 'full') {
      // Full wipe: delete all indexer-owned rows
      await this.prisma.$transaction([
        this.prisma.transactionHistory.deleteMany({
          where: { sorobanEventId: { not: null } },
        }),
        this.prisma.position.deleteMany({}),
        this.prisma.indexerCheckpoint.deleteMany({
          where: { id: CHECKPOINT_ID },
        }),
        this.prisma.indexerEventDedup.deleteMany({}),
        this.prisma.assetInterestState.deleteMany({}),
        this.prisma.assetInterestParams.deleteMany({}),
      ]);
    } else {
      // Scoped wipe: only delete rows newer than checkpoint ledger
      const checkpoint = await this.getCheckpoint();
      const lastIndexedLedger = checkpoint.lastIndexedLedger;

      await this.prisma.$transaction([
        this.prisma.transactionHistory.deleteMany({
          where: {
            sorobanEventId: { not: null },
            ledgerSequence: { gt: lastIndexedLedger },
          },
        }),
        this.prisma.position.deleteMany({
          where: {
            user: {
              transactions: {
                some: {
                  ledgerSequence: { gt: lastIndexedLedger },
                },
              },
            },
          },
        }),
        this.prisma.indexerCheckpoint.deleteMany({
          where: { id: CHECKPOINT_ID },
        }),
        this.prisma.indexerEventDedup.deleteMany({
          where: { ledger: { gt: lastIndexedLedger } },
        }),
        this.prisma.assetInterestState.deleteMany({}),
        this.prisma.assetInterestParams.deleteMany({}),
      ]);
    }
  }
}

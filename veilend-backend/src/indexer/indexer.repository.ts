import { randomUUID } from 'crypto';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TransactionPartyRole,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IndexerCheckpoint {
  lastIndexedLedger: number;
}

export type IndexerTransactionType =
  'deposit' | 'borrow' | 'repay' | 'withdraw' | 'liquidation';

export interface IndexerTransaction {
  id: string;
  userAddress: string;
  type: IndexerTransactionType;
  assetAddress: string;
  amount: string; // i128 values represented as strings to preserve precision
  ledger: number;
  txHash: string;
  eventIndex?: number;
  timestamp: string;
}

/**
 * Parsed `liquidate` contract-event payload. `tx.assetAddress`/`amount` carry
 * the COLLATERAL side (seized); debt-side fields live here.
 */
export interface LiquidationEventPayload {
  liquidatorAddress: string;
  borrowerAddress: string;
  collateralAsset: string;
  debtAsset: string;
  repaidRaw: bigint;
  seizedRaw: bigint;
  clipped: boolean;
  clippedByBps?: number | null;
}

export interface IndexerParsedEvent {
  tx: IndexerTransaction;
  depositedDelta: bigint;
  borrowedDelta: bigint;
  liquidation?: LiquidationEventPayload;
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

const TX_TYPE_MAP: Record<IndexerTransactionType, TransactionType> = {
  deposit: TransactionType.DEPOSIT,
  borrow: TransactionType.BORROW,
  repay: TransactionType.REPAY,
  withdraw: TransactionType.WITHDRAW,
  liquidation: TransactionType.LIQUIDATION,
};

const TX_TYPE_REVERSE_MAP: Record<TransactionType, IndexerTransactionType> = {
  DEPOSIT: 'deposit',
  BORROW: 'borrow',
  REPAY: 'repay',
  WITHDRAW: 'withdraw',
  LIQUIDATION: 'liquidation',
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
   * 3. Creates the TransactionHistory row(s) — liquidations produce one copy
   *    per party (borrower + liquidator) plus a LiquidationEvent row.
   * 4. Updates Position balances under a row-level lock (FOR UPDATE).
   * 5. Records event in the IndexerEventDedup lookaside table.
   *
   * Returns `{ isNew: true }` if newly indexed; `{ isNew: false }` if skipped duplicate.
   */
  async processEventSafe(
    params: {
      tx: IndexerTransaction;
      depositedDelta: bigint;
      borrowedDelta: bigint;
      liquidation?: LiquidationEventPayload;
    },
    db?: Prisma.TransactionClient,
  ): Promise<{ isNew: boolean }> {
    const { tx } = params;
    const timestamp = new Date(tx.timestamp);
    const eventIndex = tx.eventIndex ?? extractEventIndex(tx.id);

    const execute = async (client: Prisma.TransactionClient) => {
      // 1. Lookaside + DB deduplication check
      const isDup = await this.isEventDuplicate(
        tx.id,
        tx.txHash,
        eventIndex,
        client,
      );
      if (isDup) {
        return { isNew: false };
      }

      try {
        if (tx.type === 'liquidation' && params.liquidation) {
          await this.applyLiquidationEvent(
            client,
            params.liquidation,
            tx,
            timestamp,
            eventIndex,
          );
        } else {
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
            params.depositedDelta,
            params.borrowedDelta,
          );
        }

        // Record in lookaside table for fast subsequent dedup
        await this.recordEventDedup(
          tx.id,
          tx.txHash,
          eventIndex,
          tx.ledger,
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

    // Standalone path relies on row-level FOR UPDATE locking for correctness
    // (default isolation). Batch ingestion wraps many events in one outer
    // transaction instead, so it passes `db` and skips this.
    return this.prisma.$transaction(execute);
  }

  /**
   * Persists an indexed `liquidate` contract event:
   * - One LiquidationEvent read-model row (shared by both parties).
   * - Two TransactionHistory rows — partyRole BORROWER (amount = debt repaid)
   *   and partyRole LIQUIDATOR (amount = collateral seized) — so both sides
   *   see the liquidation in their history.
   * - Borrower position updates on BOTH affected assets under row locks:
   *   debt −repaid on the debt asset, collateral −seized on the collateral
   *   asset.
   * - Flags badDebt when the seizure exhausted the collateral balance while
   *   outstanding debt remained.
   *
   * Callers must run this inside the standard dedup guard (sorobanEventId /
   * IndexerEventDedup); idempotency of the LiquidationEvent row itself is
   * enforced by its unique sorobanEventId.
   */
  private async applyLiquidationEvent(
    db: Prisma.TransactionClient,
    payload: LiquidationEventPayload,
    tx: IndexerTransaction,
    timestamp: Date,
    eventIndex: number,
  ): Promise<void> {
    const borrower = await this.resolveUser(db, payload.borrowerAddress);
    const liquidator = await this.resolveUser(db, payload.liquidatorAddress);
    const debtAsset = await this.resolveAsset(db, payload.debtAsset);
    const collateralAsset = await this.resolveAsset(
      db,
      payload.collateralAsset,
    );

    // Lock both borrower position rows (creating them if absent) so the
    // balance math serializes against concurrent deposits/borrows/withdraws.
    const debtBefore = await this.readPositionForUpdate(
      db,
      borrower.id,
      debtAsset.id,
    );
    const collateralBefore = await this.readPositionForUpdate(
      db,
      borrower.id,
      collateralAsset.id,
    );

    // tx.amount carries the repaid (debt-side) amount set by the parser.
    const repaidRaw = BigInt(tx.amount);
    const seizedRaw = payload.seizedRaw;

    const nextBorrowed = clampNonNegative(debtBefore.borrowedRaw - repaidRaw);
    const nextCollateral = clampNonNegative(
      collateralBefore.depositedRaw - seizedRaw,
    );

    // Collateral fully consumed while outstanding debt remains → the position
    // was underwater past the point where seizing could restore coverage.
    const badDebt =
      collateralBefore.depositedRaw > 0n &&
      nextCollateral === 0n &&
      nextBorrowed > 0n;

    await db.liquidationEvent.create({
      data: {
        sorobanEventId: tx.id,
        txHash: tx.txHash || null,
        ledger: tx.ledger,
        liquidatorAddress: this.normalize(payload.liquidatorAddress),
        borrowerAddress: this.normalize(payload.borrowerAddress),
        debtAssetId: debtAsset.id,
        collateralAssetId: collateralAsset.id,
        repaidRaw,
        seizedRaw,
        clipped: payload.clipped,
        clippedByBps: payload.clippedByBps ?? null,
        badDebt,
        createdAt: timestamp,
      },
    });

    // Borrower copy: their DEBT was reduced by the repayment...
    await db.transactionHistory.create({
      data: {
        userId: borrower.id,
        assetId: debtAsset.id,
        type: TransactionType.LIQUIDATION,
        status: TransactionStatus.CONFIRMED,
        partyRole: TransactionPartyRole.BORROWER,
        amountRaw: repaidRaw,
        amountUsd: 0,
        txHash: tx.txHash || null,
        eventIndex,
        ledgerSequence: tx.ledger,
        contractId: this.normalize(payload.debtAsset),
        sorobanEventId: tx.id,
        createdAt: timestamp,
        confirmedAt: timestamp,
      },
    });

    // ...liquidator copy: they received the SEIZED collateral.
    await db.transactionHistory.create({
      data: {
        userId: liquidator.id,
        assetId: collateralAsset.id,
        type: TransactionType.LIQUIDATION,
        status: TransactionStatus.CONFIRMED,
        partyRole: TransactionPartyRole.LIQUIDATOR,
        amountRaw: seizedRaw,
        amountUsd: 0,
        txHash: tx.txHash || null,
        eventIndex,
        ledgerSequence: tx.ledger,
        contractId: this.normalize(payload.collateralAsset),
        sorobanEventId: `${tx.id}:liq`,
        createdAt: timestamp,
        confirmedAt: timestamp,
      },
    });

    await this.writePositionBalances(db, borrower.id, debtAsset.id, {
      borrowedRaw: nextBorrowed,
    });
    await this.writePositionBalances(db, borrower.id, collateralAsset.id, {
      depositedRaw: nextCollateral,
    });
  }

  /** Ensures the Position row exists and returns its balances row-locked. */
  private async readPositionForUpdate(
    db: Prisma.TransactionClient,
    userId: string,
    assetId: string,
  ): Promise<{ depositedRaw: bigint; borrowedRaw: bigint }> {
    await this.ensurePositionRow(db, userId, assetId);

    const rows = await db.$queryRaw<
      Array<{ depositedRaw: bigint; borrowedRaw: bigint }>
    >(Prisma.sql`
      SELECT "depositedRaw", "borrowedRaw"
      FROM "Position"
      WHERE "userId" = ${userId} AND "assetId" = ${assetId}
      FOR UPDATE
    `);

    return {
      depositedRaw: BigInt(rows[0]?.depositedRaw ?? 0n),
      borrowedRaw: BigInt(rows[0]?.borrowedRaw ?? 0n),
    };
  }

  private async ensurePositionRow(
    db: Prisma.TransactionClient,
    userId: string,
    assetId: string,
  ): Promise<void> {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "Position" ("id", "userId", "assetId", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, ${assetId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "assetId") DO NOTHING
    `);
  }

  /**
   * Writes absolute balances after a row lock and refreshes sync metadata.
   * The Position row must already exist — callers go through
   * readPositionForUpdate first, which creates it under the same lock.
   */
  private async writePositionBalances(
    db: Prisma.TransactionClient,
    userId: string,
    assetId: string,
    balances: { depositedRaw?: bigint; borrowedRaw?: bigint },
  ): Promise<void> {
    await db.$executeRaw(Prisma.sql`
      UPDATE "Position"
      SET
        "depositedRaw" = COALESCE(${balances.depositedRaw ?? null}, "depositedRaw"),
        "borrowedRaw" = COALESCE(${balances.borrowedRaw ?? null}, "borrowedRaw"),
        "isStale" = false,
        "lastSyncAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "assetId" = ${assetId}
    `);
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
    const current = await this.readPositionForUpdate(db, userId, assetId);

    let nextDeposited = current.depositedRaw + depositedDelta;
    let nextBorrowed = current.borrowedRaw + borrowedDelta;

    if (nextDeposited < 0n) nextDeposited = 0n;
    if (nextBorrowed < 0n) nextBorrowed = 0n;

    await this.writePositionBalances(db, userId, assetId, {
      depositedRaw: nextDeposited,
      borrowedRaw: nextBorrowed,
    });
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
      tx,
      depositedDelta,
      borrowedDelta,
    });
    return result.isNew;
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
   * Clears indexer-owned read models (positions, indexed transactions,
   * liquidation events, checkpoints, and dedup lookaside rows) so a replay
   * can rebuild them from scratch. UserRiskState is scanner-owned and left in
   * place — the next risk scan refreshes it.
   */
  async resetDatabase(): Promise<void> {
    this.logger.log('Resetting indexer database read models (for replay)...');
    await this.prisma.$transaction([
      this.prisma.transactionHistory.deleteMany({
        where: { sorobanEventId: { not: null } },
      }),
      this.prisma.liquidationEvent.deleteMany({}),
      this.prisma.position.deleteMany({}),
      this.prisma.indexerCheckpoint.deleteMany({
        where: { id: CHECKPOINT_ID },
      }),
      this.prisma.indexerEventDedup.deleteMany({}),
    ]);
  }
}

/**
 * Clamps a raw balance to a minimum of 0 (bigint).
 */
function clampNonNegative(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

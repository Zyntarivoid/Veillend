import { Injectable, Logger } from '@nestjs/common';
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
  private async resolveUser(walletAddress: string) {
    const normalized = this.normalize(walletAddress);
    return this.prisma.user.upsert({
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
  private async resolveAsset(assetAddress: string) {
    const normalized = this.normalize(assetAddress);
    return this.prisma.asset.upsert({
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

  /**
   * Persists a transaction if it hasn't been seen before. Returns true if
   * this call newly created the row, false if it was already indexed
   * (duplicate delivery/replay) — callers must skip position updates when
   * this returns false, to avoid double-counting balances.
   */
  async saveTransaction(tx: IndexerTransaction): Promise<boolean> {
    const existing = await this.prisma.transactionHistory.findUnique({
      where: { sorobanEventId: tx.id },
    });
    if (existing) {
      return false;
    }

    const user = await this.resolveUser(tx.userAddress);
    const asset = await this.resolveAsset(tx.assetAddress);
    const timestamp = new Date(tx.timestamp);

    try {
      await this.prisma.transactionHistory.create({
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
      return true;
    } catch (error) {
      // Race: another writer inserted the same sorobanEventId between our
      // existence check and this create. Treat as a duplicate, not a failure.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
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

  /**
   * Applies deltas to a user's position for one asset, clamping balances to
   * a minimum of 0. The read-modify-write here relies on the indexer's poll
   * loop processing events strictly serially (single writer) — if indexing
   * is ever parallelized, this needs row-level locking or an atomic
   * increment-then-clamp instead.
   */
  async updatePosition(
    userAddress: string,
    assetAddress: string,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<void> {
    const user = await this.resolveUser(userAddress);
    const asset = await this.resolveAsset(assetAddress);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.position.findUnique({
        where: { userId_assetId: { userId: user.id, assetId: asset.id } },
      });

      const currentDeposited = existing?.depositedRaw ?? 0n;
      const currentBorrowed = existing?.borrowedRaw ?? 0n;

      let nextDeposited = currentDeposited + depositedDelta;
      let nextBorrowed = currentBorrowed + borrowedDelta;

      if (nextDeposited < 0n) nextDeposited = 0n;
      if (nextBorrowed < 0n) nextBorrowed = 0n;

      await tx.position.upsert({
        where: { userId_assetId: { userId: user.id, assetId: asset.id } },
        create: {
          userId: user.id,
          assetId: asset.id,
          depositedRaw: nextDeposited,
          borrowedRaw: nextBorrowed,
          isStale: false,
          lastSyncAt: new Date(),
        },
        update: {
          depositedRaw: nextDeposited,
          borrowedRaw: nextBorrowed,
          isStale: false,
          lastSyncAt: new Date(),
        },
      });
    });
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

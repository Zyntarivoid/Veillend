import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

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

export interface IndexerSchema {
  checkpoint: IndexerCheckpoint;
  transactions: IndexerTransaction[];
  positions: IndexerPosition[];
  assets: IndexerAsset[];
}

@Injectable()
export class IndexerRepository {
  private readonly logger = new Logger(IndexerRepository.name);
  private readonly dbPath = path.join(process.cwd(), 'veilend-db.json');

  private defaultSchema(): IndexerSchema {
    return {
      checkpoint: { lastIndexedLedger: 0 },
      transactions: [],
      positions: [],
      assets: [],
    };
  }

  private async loadData(): Promise<IndexerSchema> {
    try {
      if (!existsSync(this.dbPath)) {
        await this.saveData(this.defaultSchema());
        return this.defaultSchema();
      }
      const dataStr = await fs.readFile(this.dbPath, 'utf8');
      return JSON.parse(dataStr) as IndexerSchema;
    } catch (error) {
      this.logger.error(
        `Failed to load indexer database from file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.defaultSchema();
    }
  }

  private async saveData(data: IndexerSchema): Promise<void> {
    try {
      // Ensure directory exists (useful if writing to a subfolder)
      const dir = path.dirname(this.dbPath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      this.logger.error(
        `Failed to save indexer database to file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getCheckpoint(): Promise<IndexerCheckpoint> {
    const data = await this.loadData();
    return data.checkpoint;
  }

  async saveCheckpoint(ledger: number): Promise<void> {
    const data = await this.loadData();
    data.checkpoint.lastIndexedLedger = ledger;
    await this.saveData(data);
  }

  async getTransactions(userAddress: string): Promise<IndexerTransaction[]> {
    const data = await this.loadData();
    // Case-insensitive comparison
    const target = userAddress.toLowerCase();
    return data.transactions.filter(
      (tx) => tx.userAddress.toLowerCase() === target,
    );
  }

  async saveTransaction(tx: IndexerTransaction): Promise<void> {
    const data = await this.loadData();
    // Check for duplicate transaction ID to enforce idempotency
    const exists = data.transactions.some((t) => t.id === tx.id);
    if (!exists) {
      data.transactions.push(tx);
      await this.saveData(data);
    }
  }

  async getPositions(userAddress: string): Promise<IndexerPosition[]> {
    const data = await this.loadData();
    const target = userAddress.toLowerCase();
    return data.positions.filter(
      (pos) => pos.userAddress.toLowerCase() === target,
    );
  }

  async updatePosition(
    userAddress: string,
    assetAddress: string,
    depositedDelta: bigint,
    borrowedDelta: bigint,
  ): Promise<void> {
    const data = await this.loadData();
    const userTarget = userAddress.toLowerCase();
    const assetTarget = assetAddress.toLowerCase();

    let pos = data.positions.find(
      (p) =>
        p.userAddress.toLowerCase() === userTarget &&
        p.assetAddress.toLowerCase() === assetTarget,
    );

    if (!pos) {
      pos = {
        userAddress,
        assetAddress,
        deposited: '0',
        borrowed: '0',
        updatedAt: new Date().toISOString(),
      };
      data.positions.push(pos);
    }

    const currentDeposited = BigInt(pos.deposited);
    const currentBorrowed = BigInt(pos.borrowed);

    let nextDeposited = currentDeposited + depositedDelta;
    let nextBorrowed = currentBorrowed + borrowedDelta;

    // Guard against negative balances
    if (nextDeposited < 0n) nextDeposited = 0n;
    if (nextBorrowed < 0n) nextBorrowed = 0n;

    pos.deposited = nextDeposited.toString();
    pos.borrowed = nextBorrowed.toString();
    pos.updatedAt = new Date().toISOString();

    await this.saveData(data);
  }

  async getAssets(): Promise<IndexerAsset[]> {
    const data = await this.loadData();
    return data.assets;
  }

  async setAssetSupported(
    assetAddress: string,
    supported: boolean,
  ): Promise<void> {
    const data = await this.loadData();
    const target = assetAddress.toLowerCase();
    let asset = data.assets.find(
      (a) => a.assetAddress.toLowerCase() === target,
    );

    if (!asset) {
      asset = {
        assetAddress,
        supported,
        updatedAt: new Date().toISOString(),
      };
      data.assets.push(asset);
    } else {
      asset.supported = supported;
      asset.updatedAt = new Date().toISOString();
    }

    await this.saveData(data);
  }

  async resetDatabase(): Promise<void> {
    this.logger.log('Resetting indexer database read models (for replay)...');
    await this.saveData(this.defaultSchema());
  }
}

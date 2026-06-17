import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { scValToNative, rpc, xdr } from '@stellar/stellar-sdk';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import {
  IndexerRepository,
  IndexerTransaction,
  IndexerPosition,
} from './indexer.repository';

@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private isProcessing = false;
  private pollTimeout?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly rpcService: SorobanRpcService,
    private readonly repository: IndexerRepository,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Starting Soroban event indexer polling loop...');
    this.startPolling();
  }

  onModuleDestroy() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
  }

  private startPolling() {
    const interval = this.configService.get<number>(
      'indexer.pollIntervalMs',
      5000,
    );
    this.pollTimeout = setTimeout(() => {
      void this.runIndexer().then(() => {
        this.startPolling();
      });
    }, interval);
  }

  async runIndexer() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      const configStartLedger = this.configService.get<number>(
        'indexer.startLedger',
        1,
      );
      const contractId = this.configService.get<string>(
        'indexer.contractId',
        '',
      );

      if (!contractId) {
        this.logger.warn(
          'Stellar contract ID not configured. Skipping event indexing.',
        );
        this.isProcessing = false;
        return;
      }

      const checkpoint = await this.repository.getCheckpoint();
      let lastLedger = checkpoint.lastIndexedLedger;
      if (lastLedger === 0) {
        lastLedger = configStartLedger - 1;
      }

      const rpcClient = this.rpcService.getClient();

      // Safety check: check RPC retention window
      try {
        const health = await rpcClient.getHealth();
        if (lastLedger + 1 < health.oldestLedger) {
          this.logger.warn(
            `Last indexed ledger (${lastLedger}) is older than RPC retention oldest ledger (${health.oldestLedger}). Forwarding checkpoint to oldest available ledger.`,
          );
          lastLedger = health.oldestLedger - 1;
        }
      } catch (healthError) {
        this.logger.warn(
          `Failed to verify RPC health: ${healthError instanceof Error ? healthError.message : String(healthError)}`,
        );
      }

      const latestLedgerResp = await rpcClient.getLatestLedger();
      const latestLedger = latestLedgerResp.sequence;

      if (latestLedger > lastLedger) {
        this.logger.log(
          `Indexing ledgers from ${lastLedger + 1} to ${latestLedger}...`,
        );
        await this.indexEvents(lastLedger + 1, latestLedger, contractId);
      }
    } catch (error) {
      this.logger.error(
        `Error in event indexer cycle: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async indexEvents(
    startLedger: number,
    endLedger: number,
    contractId: string,
  ) {
    const rpcClient = this.rpcService.getClient();
    let currentLedger = startLedger - 1;
    let cursor: string | undefined = undefined;

    while (true) {
      try {
        const filters = [
          {
            type: 'contract' as const,
            contractIds: [contractId],
            topics: [['veillend', '*']],
          },
        ];

        const requestParams = {
          filters,
          limit: 100,
          ...(cursor
            ? { cursor }
            : { startLedger: currentLedger + 1, endLedger }),
        } as unknown as rpc.Api.GetEventsRequest;

        // fetch events using current pagination state
        const response = await rpcClient.getEvents(requestParams);
        const events = response.events || [];

        for (const event of events) {
          await this.processEvent(event);
        }

        if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          currentLedger = lastEvent.ledger;
        } else {
          currentLedger = endLedger;
        }

        if (
          !response.cursor ||
          events.length < 100 ||
          currentLedger >= endLedger
        ) {
          break;
        }
        cursor = response.cursor;
      } catch (error) {
        this.logger.error(
          `Failed to fetch events for range ${currentLedger + 1} to ${endLedger}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }
    }

    if (currentLedger >= startLedger) {
      await this.repository.saveCheckpoint(currentLedger);
      this.logger.log(`Checkpoint updated to ledger: ${currentLedger}`);
    }
  }

  private async processEvent(event: {
    id: string;
    topic: unknown[];
    value: unknown;
    ledgerClosedAt?: string;
    txHash?: string;
    ledger: number;
  }) {
    try {
      const parsedTopics = event.topic.map(
        (t) => scValToNative(t as xdr.ScVal) as unknown,
      );
      const topic0 = this.topicToString(parsedTopics[0]);

      if (topic0 !== 'veillend') {
        return;
      }

      const topic1 = this.topicToString(parsedTopics[1]);
      const userAddress = this.topicToString(parsedTopics[2]);
      const assetAddress = this.topicToString(parsedTopics[3]);

      const timestamp = event.ledgerClosedAt || new Date().toISOString();
      const txHash = event.txHash || '';
      const ledger = event.ledger;
      const id = event.id;

      this.logger.log(
        `Processing contract event: [${topic1}] for user: ${userAddress} on asset: ${assetAddress}`,
      );

      if (topic1 === 'asset_configured') {
        const supported = scValToNative(event.value as xdr.ScVal) as boolean;
        await this.repository.setAssetSupported(assetAddress, supported);
      } else if (['deposit', 'borrow', 'repay', 'withdraw'].includes(topic1)) {
        const amountVal = scValToNative(event.value as xdr.ScVal) as unknown;
        const amount = this.parseAmount(amountVal);
        const amountStr = amount.toString();

        await this.repository.saveTransaction({
          id,
          userAddress,
          type: topic1 as 'deposit' | 'borrow' | 'repay' | 'withdraw',
          assetAddress,
          amount: amountStr,
          ledger,
          txHash,
          timestamp,
        });

        let depositedDelta = 0n;
        let borrowedDelta = 0n;

        if (topic1 === 'deposit') {
          depositedDelta = amount;
        } else if (topic1 === 'withdraw') {
          depositedDelta = -amount;
        } else if (topic1 === 'borrow') {
          borrowedDelta = amount;
        } else if (topic1 === 'repay') {
          borrowedDelta = -amount;
        }

        await this.repository.updatePosition(
          userAddress,
          assetAddress,
          depositedDelta,
          borrowedDelta,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private topicToString(topic: unknown): string {
    if (!topic) return '';
    if (typeof topic === 'string') return topic;
    if (Buffer.isBuffer(topic)) return topic.toString('utf8');
    if (typeof topic === 'object') {
      if (
        'toString' in topic &&
        typeof topic.toString === 'function' &&
        topic.toString !== Object.prototype.toString
      ) {
        return (topic as { toString(): string }).toString();
      }
      return JSON.stringify(topic);
    }
    if (typeof topic === 'symbol') {
      return topic.description || '';
    }
    if (
      typeof topic === 'number' ||
      typeof topic === 'boolean' ||
      typeof topic === 'bigint'
    ) {
      return String(topic);
    }
    return '';
  }

  private parseAmount(val: unknown): bigint {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') return BigInt(val);
    if (typeof val === 'string') {
      try {
        return BigInt(val);
      } catch {
        return 0n;
      }
    }
    return 0n;
  }

  // Exposed getter helpers for query APIs
  async getTransactions(userAddress: string): Promise<IndexerTransaction[]> {
    return this.repository.getTransactions(userAddress);
  }

  async getPositions(userAddress: string): Promise<IndexerPosition[]> {
    return this.repository.getPositions(userAddress);
  }

  async forceReplay(): Promise<void> {
    await this.repository.resetDatabase();
    this.logger.log(
      'Force replay requested. Database reset and indexing from start ledger.',
    );
    // Trigger run immediately in the background
    void this.runIndexer();
  }
}

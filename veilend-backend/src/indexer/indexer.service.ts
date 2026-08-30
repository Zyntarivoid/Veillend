import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { scValToNative, rpc, xdr } from '@stellar/stellar-sdk';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import {
  IndexerRepository,
  IndexerTransaction,
  IndexerPosition,
  IndexerParsedEvent,
  extractEventIndex,
} from './indexer.repository';

export interface ReplayState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  fromLedger: number;
  toLedger: number;
  currentLedger: number;
  targetLedger: number;
  chunkSize: number;
  percent: number;
  etaSeconds: number | null;
  insertedCount: number;
  alreadyProcessedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface ReplayOptions {
  fromLedger?: number;
  toLedger?: number;
  chunk?: number;
}

export interface ReplayResult {
  success: boolean;
  message: string;
  status: string;
  fromLedger: number;
  toLedger: number;
  chunk: number;
  inserted: number;
  already_processed: number;
  alreadyProcessed: number;
  currentLedger: number;
  percent: number;
}

export interface SyncStats {
  syncStatus: 'idle' | 'syncing' | 'replaying' | 'error';
  currentLedger: number;
  lastIndexedLedger: number;
  latestLedger: number | null;
  lag: number;
  percent: number;
  eta: number | null;
  dedupCounter: number;
  insertedCounter: number;
  lastError: string | null;
  isProcessing: boolean;
  replay: ReplayState;
  unhandledEventTopics: Record<string, number>;
}

const DEFAULT_CHUNK_SIZE = 100;

@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private isProcessing = false;
  private replayRunning = false;
  private pollTimeout?: NodeJS.Timeout;

  private syncStatus: 'idle' | 'syncing' | 'replaying' | 'error' = 'idle';
  private lastError: string | null = null;
  private dedupCounter = 0;
  private insertedCounter = 0;
  private unhandledEventTopics: Record<string, number> = {};
  private loggedUnhandledTopics = new Set<string>();

  private replayState: ReplayState = {
    status: 'idle',
    fromLedger: 0,
    toLedger: 0,
    currentLedger: 0,
    targetLedger: 0,
    chunkSize: DEFAULT_CHUNK_SIZE,
    percent: 0,
    etaSeconds: null,
    insertedCount: 0,
    alreadyProcessedCount: 0,
    startedAt: null,
    completedAt: null,
    lastError: null,
  };

  constructor(
    private readonly configService: AppConfigService,
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
    const interval = this.configService.indexer.pollIntervalMs;
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
    this.syncStatus = 'syncing';
    this.lastError = null;

    try {
      const configStartLedger = this.configService.indexer.startLedger;
      const contractId = this.configService.indexer.contractId;

      if (!contractId) {
        this.logger.warn(
          'Stellar contract ID not configured. Skipping event indexing.',
        );
        this.syncStatus = 'idle';
        this.isProcessing = false;
        return;
      }

      // Periodically clean expired dedup cache rows
      try {
        await this.repository.cleanExpiredDedup();
      } catch (cleanErr) {
        this.logger.debug(
          `Dedup cache cleanup notice: ${cleanErr instanceof Error ? cleanErr.message : String(cleanErr)}`,
        );
      }

      const checkpoint = await this.repository.getCheckpoint();
      let lastLedger = checkpoint.lastIndexedLedger;
      if (lastLedger === 0) {
        lastLedger = configStartLedger - 1;
      }

      // Safety check: check RPC retention window
      try {
        const health = await this.rpcService.getHealth();
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

      const latestLedgerResp = await this.rpcService.getLatestLedger();
      const latestLedger = latestLedgerResp.sequence;

      if (latestLedger > lastLedger) {
        const startLedger = lastLedger + 1;
        this.logger.log(
          `Indexing ledgers in transactional chunks from ${startLedger} to ${latestLedger}...`,
        );
        await this.indexEventsInChunks(startLedger, latestLedger, contractId);
      }
      this.syncStatus = 'idle';
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.lastError = errMsg;
      this.syncStatus = 'error';
      this.logger.error(`Error in event indexer cycle: ${errMsg}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processes a ledger range in transactional chunks.
   * Every chunk commits all event writes, position deltas, dedup lookaside rows,
   * and the checkpoint advance in a SINGLE prisma.$transaction.
   */
  async indexEventsInChunks(
    startLedger: number,
    endLedger: number,
    contractId: string,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
    onChunkProcessed?: (chunkProgress: {
      chunkStart: number;
      chunkEnd: number;
      inserted: number;
      alreadyProcessed: number;
    }) => void,
  ): Promise<{ inserted: number; alreadyProcessed: number }> {
    let totalInserted = 0;
    let totalAlreadyProcessed = 0;

    for (
      let chunkStart = startLedger;
      chunkStart <= endLedger;
      chunkStart += chunkSize
    ) {
      const chunkEnd = Math.min(chunkStart + chunkSize - 1, endLedger);
      this.logger.debug(
        `Fetching events for chunk ledgers ${chunkStart}..${chunkEnd}`,
      );

      const parsedEvents = await this.fetchAndParseEvents(
        chunkStart,
        chunkEnd,
        contractId,
      );

      const { inserted, alreadyProcessed } = await this.repository.processChunk(
        parsedEvents,
        chunkEnd,
      );

      totalInserted += inserted;
      totalAlreadyProcessed += alreadyProcessed;
      this.insertedCounter += inserted;
      this.dedupCounter += alreadyProcessed;

      if (onChunkProcessed) {
        onChunkProcessed({
          chunkStart,
          chunkEnd,
          inserted,
          alreadyProcessed,
        });
      }
    }

    return {
      inserted: totalInserted,
      alreadyProcessed: totalAlreadyProcessed,
    };
  }

  /**
   * Legacy wrapper kept for backwards-compatibility.
   */
  async indexEvents(
    startLedger: number,
    endLedger: number,
    contractId: string,
  ): Promise<void> {
    await this.indexEventsInChunks(startLedger, endLedger, contractId);
  }

  /**
   * Replays indexing across a given ledger range in incremental chunks
   * with progress tracking, ETA estimation, and deduplication statistics.
   */
  async replay(options?: ReplayOptions): Promise<ReplayResult> {
    const contractId = this.configService.indexer.contractId;
    if (!contractId) {
      throw new Error(
        'Stellar contract ID not configured. Cannot perform replay.',
      );
    }

    let latestLedger = 0;
    try {
      const latestResp = await this.rpcService.getLatestLedger();
      latestLedger = latestResp.sequence;
    } catch {
      latestLedger = 0;
    }

    const fromLedger =
      typeof options?.fromLedger === 'number' && !isNaN(options.fromLedger)
        ? Math.max(0, options.fromLedger)
        : this.configService.indexer.startLedger;

    const toLedger =
      typeof options?.toLedger === 'number' && !isNaN(options.toLedger)
        ? options.toLedger
        : latestLedger > 0
          ? latestLedger
          : fromLedger;

    const chunkSize =
      typeof options?.chunk === 'number' && options.chunk > 0
        ? options.chunk
        : DEFAULT_CHUNK_SIZE;

    if (toLedger < fromLedger) {
      return {
        success: true,
        message: 'No ledgers to replay (toLedger < fromLedger)',
        status: 'completed',
        fromLedger,
        toLedger,
        chunk: chunkSize,
        inserted: 0,
        already_processed: 0,
        alreadyProcessed: 0,
        currentLedger: fromLedger,
        percent: 100,
      };
    }

    this.isProcessing = true;
    this.syncStatus = 'replaying';
    this.lastError = null;

    const startTime = Date.now();
    const totalLedgers = Math.max(1, toLedger - fromLedger + 1);

    this.replayState = {
      status: 'running',
      fromLedger,
      toLedger,
      currentLedger: fromLedger,
      targetLedger: toLedger,
      chunkSize,
      percent: 0,
      etaSeconds: null,
      insertedCount: 0,
      alreadyProcessedCount: 0,
      startedAt: new Date(startTime).toISOString(),
      completedAt: null,
      lastError: null,
    };

    try {
      this.logger.log(
        `Starting replay from ledger ${fromLedger} to ${toLedger} (chunk size ${chunkSize})...`,
      );

      const result = await this.indexEventsInChunks(
        fromLedger,
        toLedger,
        contractId,
        chunkSize,
        ({ chunkEnd, inserted, alreadyProcessed }) => {
          this.replayState.currentLedger = chunkEnd;
          this.replayState.insertedCount += inserted;
          this.replayState.alreadyProcessedCount += alreadyProcessed;

          const ledgersProcessed = Math.max(1, chunkEnd - fromLedger + 1);
          const percent = Math.min(
            100,
            Math.round((ledgersProcessed / totalLedgers) * 100),
          );
          this.replayState.percent = percent;

          const elapsedMs = Date.now() - startTime;
          const remainingLedgers = Math.max(0, toLedger - chunkEnd);
          if (remainingLedgers > 0 && ledgersProcessed > 0) {
            const msPerLedger = elapsedMs / ledgersProcessed;
            this.replayState.etaSeconds = Math.round(
              (remainingLedgers * msPerLedger) / 1000,
            );
          } else {
            this.replayState.etaSeconds = 0;
          }
        },
      );

      this.replayState.status = 'completed';
      this.replayState.percent = 100;
      this.replayState.etaSeconds = 0;
      this.replayState.currentLedger = toLedger;
      this.replayState.completedAt = new Date().toISOString();
      this.syncStatus = 'idle';

      this.logger.log(
        `Replay finished: ${result.inserted} inserted, ${result.alreadyProcessed} already processed.`,
      );

      return {
        success: true,
        message: `Replay completed successfully from ledger ${fromLedger} to ${toLedger}`,
        status: 'completed',
        fromLedger,
        toLedger,
        chunk: chunkSize,
        inserted: result.inserted,
        already_processed: result.alreadyProcessed,
        alreadyProcessed: result.alreadyProcessed,
        currentLedger: toLedger,
        percent: 100,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.replayState.status = 'failed';
      this.replayState.lastError = errMsg;
      this.syncStatus = 'error';
      this.lastError = errMsg;
      this.logger.error(`Replay error: ${errMsg}`);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Fetches events for a ledger chunk from Soroban RPC and parses them.
   */
  private async fetchAndParseEvents(
    startLedger: number,
    endLedger: number,
    contractId: string,
  ): Promise<IndexerParsedEvent[]> {
    const parsedItems: IndexerParsedEvent[] = [];
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
          ...(cursor ? { cursor } : { startLedger, endLedger }),
        } as unknown as rpc.Api.GetEventsRequest;

        const response = await this.rpcService.getEvents(requestParams);
        const events = response.events || [];

        for (const event of events) {
          const parsed = await this.parseEventToItem(event);
          if (parsed) {
            parsedItems.push(parsed);
          }
        }

        if (!response.cursor || events.length < 100) {
          break;
        }
        cursor = response.cursor;
      } catch (error) {
        this.logger.error(
          `Failed to fetch events for range ${startLedger} to ${endLedger}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }
    }

    return parsedItems;
  }

  /**
   * Parses a raw Soroban contract event into an IndexerParsedEvent.
   */
  private async parseEventToItem(event: {
    id: string;
    topic: unknown[];
    value: unknown;
    ledgerClosedAt?: string;
    txHash?: string;
    ledger: number;
  }): Promise<IndexerParsedEvent | null> {
    try {
      const parsedTopics = event.topic.map(
        (t) => scValToNative(t as xdr.ScVal) as unknown,
      );
      const topic0 = this.topicToString(parsedTopics[0]);

      if (topic0 !== 'veillend') {
        return null;
      }

      const topic1 = this.topicToString(parsedTopics[1]);
      const userAddress = this.topicToString(parsedTopics[2]);
      const assetAddress = this.topicToString(parsedTopics[3]);

      const timestamp = event.ledgerClosedAt || new Date().toISOString();
      const txHash = event.txHash || '';
      const ledger = event.ledger;
      const id = event.id;
      const eventIndex = extractEventIndex(id);

      if (topic1 === 'asset_configured') {
        const supported = scValToNative(event.value as xdr.ScVal) as boolean;
        await this.repository.setAssetSupported(assetAddress, supported);
        return null;
      }

      if (['deposit', 'borrow', 'repay', 'withdraw'].includes(topic1)) {
        const amountVal = scValToNative(event.value as xdr.ScVal) as unknown;
        const amount = this.parseAmount(amountVal);
        const amountStr = amount.toString();

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

        const tx: IndexerTransaction = {
          id,
          userAddress,
          type: topic1 as 'deposit' | 'borrow' | 'repay' | 'withdraw',
          assetAddress,
          amount: amountStr,
          ledger,
          txHash,
          eventIndex,
          timestamp,
        };

        return {
          kind: 'transaction',
          tx,
          depositedDelta,
          borrowedDelta,
        };
      }

      if (topic1 === 'interest_accrued') {
        const borrowIndex = this.topicToString(parsedTopics[2]);
        const supplyIndex = this.topicToString(parsedTopics[3]);
        // Note: Depending on Soroban packing, this might be a struct or vector. We'll assume event.value is an array [accrued, reserve_share].

        let accruedAmount = '0';
        let reserveShare = '0';
        try {
          const vals = scValToNative(event.value as xdr.ScVal) as unknown[];
          if (Array.isArray(vals)) {
            accruedAmount = vals[0]?.toString() || '0';
            reserveShare = vals[1]?.toString() || '0';
          }
        } catch {
          // fallback
        }

        return {
          kind: 'interest_accrued',
          assetAddress,
          borrowIndex,
          supplyIndex,
          accruedAmount,
          reserveShare,
          ledger,
          timestamp,
          eventId: id,
          txHash,
          eventIndex,
        };
      }

      if (topic1 === 'asset_reserve_updated') {
        let totalBalance = '0';
        let protocolFees = '0';
        let updateKind = '';
        try {
          const vals = scValToNative(event.value as xdr.ScVal) as unknown[];
          if (Array.isArray(vals)) {
            totalBalance = vals[0]?.toString() || '0';
            protocolFees = vals[1]?.toString() || '0';
            updateKind = vals[2]?.toString() || '';
          }
        } catch {
          // fallback
        }

        return {
          kind: 'asset_reserve_updated',
          assetAddress,
          totalBalance,
          protocolFees,
          updateKind,
          ledger,
          timestamp,
          eventId: id,
          txHash,
          eventIndex,
        };
      }

      if (topic1 === 'interest_params_updated') {
        let baseRateBps = 0;
        let kinkUtilBps = 0;
        let slope1Bps = 0;
        let slope2Bps = 0;
        let reserveFactorBps = 0;
        try {
          const vals = scValToNative(event.value as xdr.ScVal) as unknown[];
          if (Array.isArray(vals)) {
            baseRateBps = Number(vals[0]) || 0;
            kinkUtilBps = Number(vals[1]) || 0;
            slope1Bps = Number(vals[2]) || 0;
            slope2Bps = Number(vals[3]) || 0;
            reserveFactorBps = Number(vals[4]) || 0;
          }
        } catch {
          // fallback
        }

        return {
          kind: 'interest_params_updated',
          assetAddress,
          baseRateBps,
          kinkUtilBps,
          slope1Bps,
          slope2Bps,
          reserveFactorBps,
          ledger,
          timestamp,
          eventId: id,
          txHash,
          eventIndex,
        };
      }

      if (['contract_upgraded', 'storage_migrated'].includes(topic1)) {
        this.logger.log(
          `Governance event [${topic1}] at ledger ${ledger} (tx ${txHash})`,
        );
        return null;
      }

      // Track unhandled topics
      if (!this.unhandledEventTopics[topic1]) {
        this.unhandledEventTopics[topic1] = 0;
      }
      this.unhandledEventTopics[topic1]++;
      if (!this.loggedUnhandledTopics.has(topic1)) {
        this.loggedUnhandledTopics.add(topic1);
        this.logger.warn(
          `Unhandled contract event topic: ${topic1} (logged once)`,
        );
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error parsing event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
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

  async forceReplay(scope: 'full' | 'bad-only' = 'full'): Promise<void> {
    await this.repository.resetDatabase(scope);
    this.dedupCounter = 0;
    this.insertedCounter = 0;
    this.logger.log(
      `Force replay requested. Database reset (scope: ${scope}) and replay triggered.`,
    );
    void this.replay({ fromLedger: this.configService.indexer.startLedger });
  }

  /**
   * Returns comprehensive indexer statistics, lag metrics, and replay state.
   */
  async getSyncStats(): Promise<SyncStats> {
    const checkpoint = await this.repository.getCheckpoint();
    const currentLedger = checkpoint.lastIndexedLedger;

    let latestLedger: number | null = null;
    try {
      const resp = await this.rpcService.getLatestLedger();
      latestLedger = resp.sequence;
    } catch {
      latestLedger = null;
    }

    const lag =
      latestLedger !== null ? Math.max(0, latestLedger - currentLedger) : 0;

    let percent = 100;
    let eta: number | null = null;

    if (this.replayState.status === 'running') {
      percent = this.replayState.percent;
      eta = this.replayState.etaSeconds;
    } else if (latestLedger && latestLedger > currentLedger) {
      const configStart = this.configService.indexer.startLedger;
      const totalSpan = Math.max(1, latestLedger - configStart);
      const doneSpan = Math.max(0, currentLedger - configStart);
      percent = Math.min(100, Math.round((doneSpan / totalSpan) * 100));
    }

    return {
      syncStatus: this.syncStatus,
      currentLedger,
      lastIndexedLedger: currentLedger,
      latestLedger,
      lag,
      percent,
      eta,
      dedupCounter: this.dedupCounter,
      insertedCounter: this.insertedCounter,
      lastError: this.lastError,
      isProcessing: this.isProcessing,
      replay: { ...this.replayState },
      unhandledEventTopics: { ...this.unhandledEventTopics },
    };
  }

  getReplayState(): ReplayState {
    return { ...this.replayState };
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  isReplayRunning(): boolean {
    return this.replayRunning;
  }

  setReplayRunning(value: boolean): void {
    this.replayRunning = value;
  }
}

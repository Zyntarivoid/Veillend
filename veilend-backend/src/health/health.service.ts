import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { HorizonService } from '../stellar/horizon.service';
import { IndexerService } from '../indexer/indexer.service';
import { PositionRiskScannerService } from '../risk/position-risk-scanner.service';

export interface ComponentStatus {
  status: 'up' | 'down' | 'degraded';
  latencyMs: number;
}

export interface SorobanComponentStatus extends ComponentStatus {
  ledgerSeq: number | null;
}

export interface HorizonComponentStatus extends ComponentStatus {
  coreLatestLedger: number | null;
}

export interface IndexerComponentStatus extends ComponentStatus {
  syncStatus: string;
  currentLedger: number;
  latestLedger: number | null;
  lag: number;
  dedupCounter: number;
  lastError: string | null;
}

export interface ScannerComponentStatus extends ComponentStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastScanAt: Date | null;
  scannedUsers: number;
  lastError: string | null;
}

export interface HealthResult {
  status: 'ok' | 'degraded';
  components: {
    prisma: ComponentStatus;
    sorobanRpc: SorobanComponentStatus;
    horizon: HorizonComponentStatus;
    indexer: IndexerComponentStatus;
    scanner: ScannerComponentStatus | null;
  };
  timestamp: string;
  uptimeSecs: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sorobanRpc: SorobanRpcService,
    private readonly horizon: HorizonService,
    @Optional() private readonly indexerService?: IndexerService,
    @Optional() private readonly scanner?: PositionRiskScannerService,
  ) {}

  async probePrisma(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  async probeSoroban(): Promise<SorobanComponentStatus> {
    const start = Date.now();
    try {
      const result = await this.sorobanRpc.getLatestLedger();
      return {
        status: 'up',
        ledgerSeq: result.sequence,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', ledgerSeq: null, latencyMs: Date.now() - start };
    }
  }

  async probeHorizon(): Promise<HorizonComponentStatus> {
    const start = Date.now();
    try {
      const result = (await this.horizon.getRoot()) as {
        core_latest_ledger?: number;
      };
      return {
        status: 'up',
        coreLatestLedger:
          typeof result?.core_latest_ledger === 'number'
            ? result.core_latest_ledger
            : null,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        status: 'down',
        coreLatestLedger: null,
        latencyMs: Date.now() - start,
      };
    }
  }

  async probeIndexer(
    sorobanLatestLedger?: number | null,
  ): Promise<IndexerComponentStatus> {
    const start = Date.now();
    try {
      if (!this.indexerService) {
        return {
          status: 'up',
          syncStatus: 'idle',
          currentLedger: 0,
          latestLedger: sorobanLatestLedger ?? null,
          lag: 0,
          dedupCounter: 0,
          lastError: null,
          latencyMs: Date.now() - start,
        };
      }

      const stats = await this.indexerService.getSyncStats();
      const currentLedger = stats.currentLedger;
      const latestLedger = stats.latestLedger ?? sorobanLatestLedger ?? null;
      const lag =
        latestLedger !== null ? Math.max(0, latestLedger - currentLedger) : 0;
      const isDegraded = lag > 1000 || stats.lastError !== null;

      return {
        status: isDegraded ? 'degraded' : 'up',
        syncStatus: stats.syncStatus,
        currentLedger,
        latestLedger,
        lag,
        dedupCounter: stats.dedupCounter,
        lastError: stats.lastError,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        syncStatus: 'error',
        currentLedger: 0,
        latestLedger: null,
        lag: 0,
        dedupCounter: 0,
        lastError: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Scanner health for the readiness gate: unhealthy when the scanner is
   * enabled but hasn't completed a scan recently (beyond a startup warmup
   * window) or is stuck reporting errors.
   */
  probeScanner(): ScannerComponentStatus | null {
    const start = Date.now();
    if (!this.scanner) return null;
    try {
      const status = this.scanner.getStatus();
      const { healthy, reason } = this.scanner.isHealthy();
      return {
        status: healthy ? 'up' : 'degraded',
        latencyMs: Date.now() - start,
        enabled: status.enabled,
        running: status.running,
        intervalMs: status.intervalMs,
        lastScanAt: status.lastCompletedScanAt,
        scannedUsers: status.scannedUsers,
        lastError: reason ?? status.lastError ?? null,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        enabled: true,
        running: false,
        intervalMs: 0,
        lastScanAt: null,
        scannedUsers: 0,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Readiness gate used by /health/ready. */
  isScannerReady(): boolean {
    if (!this.scanner) return true;
    return this.scanner.isHealthy().healthy;
  }

  async check(): Promise<HealthResult> {
    const [prisma, sorobanRpc, horizon] = await Promise.all([
      this.probePrisma(),
      this.probeSoroban(),
      this.probeHorizon(),
    ]);

    const indexer = await this.probeIndexer(sorobanRpc.ledgerSeq);
    const scanner = this.probeScanner();

    const anyDownOrDegraded =
      prisma.status === 'down' ||
      sorobanRpc.status === 'down' ||
      horizon.status === 'down' ||
      indexer.status === 'down' ||
      indexer.status === 'degraded' ||
      indexer.lag > 1000 ||
      (scanner !== null && scanner.status !== 'up');

    return {
      status: anyDownOrDegraded ? 'degraded' : 'ok',
      components: { prisma, sorobanRpc, horizon, indexer, scanner },
      timestamp: new Date().toISOString(),
      uptimeSecs: Math.floor(process.uptime()),
    };
  }

  async isPrismaReady(): Promise<boolean> {
    const result = await this.probePrisma();
    return result.status === 'up';
  }
}

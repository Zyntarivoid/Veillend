import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RiskRepository } from './risk.repository';
import { OraclePriceService } from './oracle-price.service';
import { RiskReadService, UserRiskSnapshot } from './risk-read.service';
import { shouldNotifyRisk, RiskBand } from './risk-band.util';

const SCANNER_INTERVAL_NAME = 'position-risk-scanner';

export interface ScannerStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastError: string | null;
  lastCompletedScanAt: Date | null;
  scannedUsers: number;
}

/**
 * Periodic position-risk scanner:
 *   - claims a DB lease so only one replica scans at a time;
 *   - walks debtor positions in chunks, dedupes users, recomputes each
 *     portfolio's health factor with fresh oracle prices;
 *   - persists a UserRiskState read model (drives the liquidation queue);
 *   - routes band transitions into NotificationsService.notifyLiquidationRisk
 *     (cooldown/opt-out enforcement lives there).
 */
@Injectable()
export class PositionRiskScannerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PositionRiskScannerService.name);
  private readonly runnerId = `scanner-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  private readonly contractId: string;

  private scanning = false;
  private lastError: string | null = null;
  private lastCompletedScanAt: Date | null = null;
  private lastScannedUserCount = 0;
  private initialBootTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: AppConfigService,
    private readonly riskRepository: RiskRepository,
    private readonly oracle: OraclePriceService,
    private readonly riskRead: RiskReadService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly schedulerRegistry?: SchedulerRegistry,
  ) {
    this.contractId = this.configService.indexer.contractId;
  }

  onApplicationBootstrap() {
    const intervalMs = this.configService.riskScan.intervalMs;
    if (!this.schedulerRegistry) {
      this.logger.warn('SchedulerRegistry unavailable; risk scanner disabled');
      return;
    }
    if (intervalMs <= 0) {
      this.logger.log(
        'RISK_SCAN_INTERVAL_MS=0 — position risk scanner disabled',
      );
      return;
    }

    const interval = setInterval(() => void this.runScanCycle(), intervalMs);
    this.schedulerRegistry.addInterval(SCANNER_INTERVAL_NAME, interval);
    this.logger.log(
      `Position risk scanner started (interval=${intervalMs}ms, runner=${this.runnerId})`,
    );

    // Kick off one scan shortly after boot rather than waiting a full interval.
    this.initialBootTimer = setTimeout(() => void this.runScanCycle(), 5_000);
    this.initialBootTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.initialBootTimer) {
      clearTimeout(this.initialBootTimer);
      this.initialBootTimer = undefined;
    }
    if (this.schedulerRegistry?.doesExist('interval', SCANNER_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(SCANNER_INTERVAL_NAME);
    }
  }

  getStatus(): ScannerStatus {
    const enabled = this.configService.riskScan.intervalMs > 0;
    return {
      enabled,
      running: this.scanning,
      intervalMs: this.configService.riskScan.intervalMs,
      lastError: this.lastError,
      lastCompletedScanAt: this.lastCompletedScanAt,
      scannedUsers: this.lastScannedUserCount,
    };
  }

  /** True once a first completed scan is recent relative to the cadence. */
  isHealthy(): { healthy: boolean; reason: string | null } {
    if (!this.getStatus().enabled) {
      return { healthy: true, reason: null };
    }
    const state = this.getStatus();
    if (state.lastError && !state.running) {
      // Stale error from a previous failed cycle — still unhealthy until the
      // next successful pass, but a currently-running retry is acceptable.
      if (!this.hasRecentSuccess()) {
        return { healthy: false, reason: state.lastError };
      }
    }
    if (!state.lastCompletedScanAt) {
      const uptimeMs = process.uptime() * 1_000;
      const warmupMs = Math.max(3 * state.intervalMs, 60_000);
      if (uptimeMs > warmupMs) {
        return {
          healthy: false,
          reason: 'no completed scan since startup',
        };
      }
      return { healthy: true, reason: 'warming up' };
    }
    const ageMs = Date.now() - state.lastCompletedScanAt.getTime();
    if (ageMs > 3 * state.intervalMs) {
      return {
        healthy: false,
        reason: `last scan ${Math.round(ageMs / 1000)}s ago`,
      };
    }
    return { healthy: true, reason: null };
  }

  private hasRecentSuccess(): boolean {
    if (!this.lastCompletedScanAt) return false;
    return (
      Date.now() - this.lastCompletedScanAt.getTime() <=
      3 * this.configService.riskScan.intervalMs
    );
  }

  /**
   * One scheduler tick. Reentrancy-guarded locally; cross-replica exclusion
   * via the DB lease. Errors are recorded, never thrown.
   */
  async runScanCycle(): Promise<void> {
    if (!this.scanning) {
      this.scanning = true;
      try {
        await this.executeScan();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger.error(`Risk scan failed: ${this.lastError}`);
        try {
          await this.riskRepository.finishScan(this.runnerId, {
            usersEvaluated: 0,
            positionsEvaluated: 0,
            notificationsSent: 0,
            unpricedCount: 0,
            durationMs: 0,
            error: this.lastError,
          });
        } catch {
          // lease row issues must not mask the original failure
        }
      } finally {
        this.scanning = false;
      }
    }
  }

  private async executeScan(): Promise<void> {
    const leaseTtlMs = this.configService.riskScan.leaseTtlMs;
    const batchSize = this.configService.riskScan.batchSize;
    const startedAt = Date.now();

    const claimed = await this.riskRepository.claimScanLease(
      this.runnerId,
      leaseTtlMs,
    );
    if (!claimed) {
      this.logger.debug('Another replica holds the risk-scan lease; skipping');
      return;
    }

    this.oracle.beginTick();
    let usersEvaluated = 0;
    let positionsEvaluated = 0;
    let notificationsSent = 0;
    let unpricedCount = 0;
    let cursor: string | undefined = undefined;
    let processedSinceLeaseRefresh = 0;

    try {
      while (true) {
        const chunk = await this.riskRepository.loadDebtorPositionChunk(
          cursor,
          batchSize,
        );
        positionsEvaluated += chunk.rows.length;

        // HF is portfolio-level → each user appears once per pass.
        const userIds = Array.from(new Set(chunk.rows.map((r) => r.userId)));

        for (const userId of userIds) {
          const { snapshot, notified } = await this.processUser(userId);
          usersEvaluated += 1;
          if (snapshot.riskStatus === 'unpriced') unpricedCount += 1;
          if (notified) notificationsSent += 1;
          processedSinceLeaseRefresh += 1;
          if (processedSinceLeaseRefresh >= batchSize) {
            await this.riskRepository.refreshScanLease(
              this.runnerId,
              leaseTtlMs,
            );
            processedSinceLeaseRefresh = 0;
          }
        }

        if (!chunk.nextCursor) break;
        cursor = chunk.nextCursor;
      }

      this.lastError = null;
      this.lastCompletedScanAt = new Date();
      this.lastScannedUserCount = usersEvaluated;
      await this.riskRepository.finishScan(this.runnerId, {
        usersEvaluated,
        positionsEvaluated,
        notificationsSent,
        unpricedCount,
        durationMs: Date.now() - startedAt,
      });
      this.logger.log(
        `Risk scan complete: ${usersEvaluated} user(s), ${positionsEvaluated} position(s), ${notificationsSent} notification(s), ${unpricedCount} unpriced in ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      await this.riskRepository.finishScan(this.runnerId, {
        usersEvaluated,
        positionsEvaluated,
        notificationsSent,
        unpricedCount,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Recomputes one user's risk snapshot, persists it, and notifies on valid
   * band transitions (entering risk or escalating severity).
   */
  async processUser(userId: string): Promise<{
    snapshot: UserRiskSnapshot;
    notified: boolean;
  }> {
    const portfolio =
      await this.riskRepository.loadUserPortfolioByUserId(userId);
    const snapshot = await this.riskRead.computeUserRisk(
      portfolio ?? {
        user: { id: userId, walletAddress: '' },
        positions: [],
      },
      this.contractId,
    );

    const existing = await this.riskRepository.getUserRiskState(userId);
    const previousBand = (existing?.band as RiskBand) ?? 'healthy';
    const lastNotifiedBand =
      (existing?.lastNotifiedBand as RiskBand | null) ?? null;

    let nextNotifiedBand = lastNotifiedBand;
    const notify = shouldNotifyRisk(
      previousBand,
      snapshot.band,
      lastNotifiedBand,
    );
    if (notify) {
      nextNotifiedBand = snapshot.band;
    }

    await this.riskRepository.upsertUserRiskState(userId, {
      band: snapshot.band,
      riskStatus: snapshot.riskStatus,
      healthFactor: snapshot.healthFactor,
      debtValueUsd: snapshot.debtValueUsd,
      collateralValueUsd: snapshot.collateralValueUsd,
      maxRepayableUsd: snapshot.maxRepayableUsd,
      estSeizableUsd: snapshot.estSeizableUsd ?? 0,
      distanceToLiquidation: snapshot.distanceToLiquidation,
      priceMoveToLiquidation: snapshot.priceMoveToLiquidation,
      primaryDebtAssetId: snapshot.primaryDebtAssetId,
      lastEvaluatedBand: snapshot.band,
      lastNotifiedBand: nextNotifiedBand,
      lastEvaluatedAt: new Date(),
    });

    let notified = false;
    if (notify && this.notifications && snapshot.healthFactor !== null) {
      try {
        await this.notifications.notifyLiquidationRisk(snapshot.userId, {
          healthFactor: snapshot.healthFactor,
          shortfallUsd: Math.max(
            0,
            snapshot.debtValueUsd - snapshot.collateralValueUsd,
          ),
          band: snapshot.band,
          debtAssetCode: snapshot.primaryDebtAssetCode,
          debtValueUsd: snapshot.debtValueUsd,
          collateralValueUsd: snapshot.collateralValueUsd,
        });
        notified = true;
      } catch (error) {
        this.logger.warn(
          `Liquidation-risk notification failed for user ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { snapshot, notified };
  }
}

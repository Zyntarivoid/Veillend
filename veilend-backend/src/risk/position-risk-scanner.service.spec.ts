import { PositionRiskScannerService } from './position-risk-scanner.service';
import { UserRiskSnapshot } from './risk-read.service';

const makeSnapshot = (
  overrides: Partial<UserRiskSnapshot> = {},
): UserRiskSnapshot => ({
  userId: 'user-1',
  walletAddress: 'GWALLET',
  band: 'healthy',
  riskStatus: 'priced',
  healthFactor: 2.5,
  debtValueUsd: 100,
  collateralValueUsd: 250,
  weightedCollateralUsd: 240,
  maxRepayableUsd: 50,
  estSeizableUsd: null,
  distanceToLiquidation: 1.5,
  priceMoveToLiquidation: 0.6,
  primaryDebtAssetId: 'asset-1',
  primaryDebtAssetCode: 'USDC',
  closeFactorBps: 5000,
  missingPrices: [],
  stalePrices: [],
  ...overrides,
});

describe('PositionRiskScannerService', () => {
  const buildScanner = (options?: {
    intervalMs?: number;
    existingState?: { band: string; lastNotifiedBand: string | null } | null;
    snapshot?: UserRiskSnapshot;
  }) => {
    const configService = {
      riskScan: {
        intervalMs: options?.intervalMs ?? 60_000,
        batchSize: 500,
        leaseTtlMs: 180_000,
      },
      indexer: { contractId: 'CCONTRACT' },
    };

    const riskRepository = {
      claimScanLease: jest.fn().mockResolvedValue(true),
      refreshScanLease: jest.fn().mockResolvedValue(undefined),
      finishScan: jest.fn().mockResolvedValue(undefined),
      loadDebtorPositionChunk: jest.fn().mockResolvedValue({
        rows: [{ userId: 'user-1' }, { userId: 'user-1' }],
        nextCursor: null,
      }),
      loadUserPortfolioByUserId: jest.fn().mockResolvedValue({
        user: { id: 'user-1', walletAddress: 'GW' },
        positions: [],
      }),
      getUserRiskState: jest
        .fn()
        .mockResolvedValue(options?.existingState ?? null),
      upsertUserRiskState: jest.fn().mockResolvedValue({}),
    };

    const oracle = {
      beginTick: jest.fn(),
      getRiskParams: jest.fn(),
      getPrice: jest.fn(),
    };

    const defaultSnapshot = options?.snapshot ?? makeSnapshot();
    const riskRead = {
      computeUserRisk: jest.fn().mockResolvedValue(defaultSnapshot),
    };

    const notifications = {
      notifyLiquidationRisk: jest.fn().mockResolvedValue(undefined),
    };

    const schedulerRegistry = {
      addInterval: jest.fn(),
      deleteInterval: jest.fn(),
      doesExist: jest.fn().mockReturnValue(false),
    };

    const scanner = new PositionRiskScannerService(
      configService as never,
      riskRepository as never,
      oracle as never,
      riskRead as never,
      notifications as never,
      schedulerRegistry as never,
    );

    return {
      scanner,
      riskRepository,
      oracle,
      riskRead,
      notifications,
      schedulerRegistry,
    };
  };

  it('registers a scan interval on bootstrap when enabled', () => {
    const { scanner, schedulerRegistry } = buildScanner();
    scanner.onApplicationBootstrap();
    expect(schedulerRegistry.addInterval).toHaveBeenCalledTimes(1);
    // Detach the real timer created by the service so jest can exit.
    schedulerRegistry.doesExist.mockReturnValue(true);
    scanner.onModuleDestroy();
  });

  it('does not register an interval when disabled (intervalMs=0)', () => {
    const { scanner, schedulerRegistry } = buildScanner({ intervalMs: 0 });
    scanner.onApplicationBootstrap();
    expect(schedulerRegistry.addInterval).not.toHaveBeenCalled();
    expect(scanner.getStatus().enabled).toBe(false);
    expect(scanner.isHealthy()).toEqual({ healthy: true, reason: null });
  });

  it('skips the cycle when another replica holds the lease', async () => {
    const { scanner, riskRepository, notifications } = buildScanner();
    riskRepository.claimScanLease.mockResolvedValue(false);

    await scanner.runScanCycle();

    expect(riskRepository.loadDebtorPositionChunk).not.toHaveBeenCalled();
    expect(notifications.notifyLiquidationRisk).not.toHaveBeenCalled();
  });

  it('dedupes users across chunk rows into one evaluation per pass', async () => {
    const { scanner, riskRead } = buildScanner();
    await scanner.runScanCycle();

    // Two rows for the same user → one portfolio computation.
    expect(riskRead.computeUserRisk).toHaveBeenCalledTimes(1);
  });

  it('notifies when entering a risk band from healthy and persists state', async () => {
    const snapshot = makeSnapshot({
      band: 'warn',
      healthFactor: 1.3,
      distanceToLiquidation: 0.3,
    });
    const { scanner, notifications, riskRepository } = buildScanner({
      snapshot,
    });

    await scanner.runScanCycle();

    expect(notifications.notifyLiquidationRisk).toHaveBeenCalledTimes(1);
    expect(notifications.notifyLiquidationRisk).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        healthFactor: 1.3,
        band: 'warn',
        shortfallUsd: 0,
      }),
    );
    expect(riskRepository.upsertUserRiskState).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        band: 'warn',
        lastEvaluatedBand: 'warn',
        lastNotifiedBand: 'warn',
      }),
    );
  });

  it('does not re-fire while the user stays in the same band', async () => {
    const { scanner, notifications } = buildScanner({
      snapshot: makeSnapshot({ band: 'warn', healthFactor: 1.3 }),
      existingState: { band: 'warn', lastNotifiedBand: 'warn' },
    });

    await scanner.runScanCycle();

    expect(notifications.notifyLiquidationRisk).not.toHaveBeenCalled();
  });

  it('fires on escalation to a strictly more severe band', async () => {
    const { scanner, notifications, riskRepository } = buildScanner({
      snapshot: makeSnapshot({
        band: 'liquidatable',
        healthFactor: 0.9,
        estSeizableUsd: 55,
      }),
      existingState: { band: 'urgent', lastNotifiedBand: 'urgent' },
    });

    await scanner.runScanCycle();

    expect(notifications.notifyLiquidationRisk).toHaveBeenCalledTimes(1);
    // Queue-visible fields are persisted for liquidatable users.
    expect(riskRepository.upsertUserRiskState).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        band: 'liquidatable',
        lastNotifiedBand: 'liquidatable',
      }),
    );
  });

  it('suppresses notifications for unpriced users without disturbing lastNotifiedBand', async () => {
    const { scanner, notifications, riskRepository } = buildScanner({
      snapshot: makeSnapshot({
        band: 'unpriced',
        riskStatus: 'unpriced',
        healthFactor: null,
        missingPrices: ['XLM'],
      }),
      existingState: { band: 'warn', lastNotifiedBand: 'warn' },
    });

    await scanner.runScanCycle();

    expect(notifications.notifyLiquidationRisk).not.toHaveBeenCalled();
    expect(riskRepository.upsertUserRiskState).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        band: 'unpriced',
        lastNotifiedBand: 'warn',
      }),
    );
  });

  it('records scan metrics and releases the lease on success', async () => {
    const { scanner, riskRepository } = buildScanner();

    await scanner.runScanCycle();

    expect(riskRepository.finishScan).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        usersEvaluated: 1,
        positionsEvaluated: 2,
      }),
    );
    expect(scanner.getStatus().lastError).toBeNull();
  });

  it('records the error and releases the lease when a scan fails', async () => {
    const { scanner, riskRepository, riskRead } = buildScanner();
    riskRead.computeUserRisk.mockRejectedValue(new Error('oracle down'));

    await scanner.runScanCycle();

    expect(riskRepository.finishScan).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error: 'oracle down' }),
    );
    expect(scanner.getStatus().lastError).toBe('oracle down');
  });
});

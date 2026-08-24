import { Test, TestingModule } from '@nestjs/testing';
import {
  WithdrawalSolvencyService,
  SolvencyErrorKind,
} from './withdrawal-solvency.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProtocolService } from '../protocol/protocol.service';

describe('WithdrawalSolvencyService', () => {
  let service: WithdrawalSolvencyService;
  let prisma: {
    position: { findMany: jest.Mock };
  };
  let protocolService: {
    getMinCollateralRatioBps: jest.Mock;
  };

  const mockUserId = 'user-123';
  const mockAssetId = 'asset-xlm';

  beforeEach(async () => {
    prisma = {
      position: { findMany: jest.fn() },
    };
    protocolService = {
      getMinCollateralRatioBps: jest.fn().mockReturnValue(12500),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalSolvencyService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProtocolService, useValue: protocolService },
      ],
    }).compile();

    service = module.get<WithdrawalSolvencyService>(WithdrawalSolvencyService);
  });

  describe('assertWithdrawable', () => {
    it('allows a healthy single-asset withdrawal with no borrows', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          assetId: mockAssetId,
          asset: { code: 'XLM', decimals: 7, minCollateralRatio: 0.7 },
          depositedRaw: BigInt(1_000_000_0000000),
          borrowedRaw: 0n,
          depositedUsd: 120,
          borrowedUsd: 0,
          isStale: false,
          lastSyncAt: new Date(),
        },
      ]);

      const result = await service.assertWithdrawable(
        mockUserId,
        mockAssetId,
        100_000_000,
      );

      expect(result.allowed).toBe(true);
      expect(result.projectedHealthFactor).toBe(Infinity);
      expect(result.currentHealthFactor).toBe(Infinity);
    });

    it('allows a multi-asset withdrawal that keeps HF above minimum', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          assetId: 'asset-xlm',
          asset: { code: 'XLM', decimals: 7, minCollateralRatio: 0.7 },
          depositedRaw: BigInt(10_000_000_0000000),
          borrowedRaw: 0n,
          depositedUsd: 1200,
          borrowedUsd: 0,
          isStale: false,
          lastSyncAt: new Date(),
        },
        {
          assetId: 'asset-usdc',
          asset: { code: 'USDC', decimals: 7, minCollateralRatio: 0.8 },
          depositedRaw: 0n,
          borrowedRaw: BigInt(500_000_000),
          depositedUsd: 0,
          borrowedUsd: 50,
          isStale: false,
          lastSyncAt: new Date(),
        },
      ]);

      const result = await service.assertWithdrawable(
        mockUserId,
        'asset-xlm',
        100_000_000,
      );

      expect(result.allowed).toBe(true);
      expect(result.projectedHealthFactor).not.toBeNull();
      expect(result.projectedHealthFactor!).toBeGreaterThan(1.0);
    });

    it('rejects when user has no positions (INSUFFICIENT_DEPOSIT)', async () => {
      prisma.position.findMany.mockResolvedValue([]);

      const result = await service.assertWithdrawable(
        mockUserId,
        mockAssetId,
        100_000_000,
      );

      expect(result.allowed).toBe(false);
      expect(result.errorKind).toBe(SolvencyErrorKind.INSUFFICIENT_DEPOSIT);
    });

    it('rejects when target asset has no position (INSUFFICIENT_DEPOSIT)', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          assetId: 'other-asset',
          asset: { code: 'USDC', decimals: 7, minCollateralRatio: 0.8 },
          depositedRaw: BigInt(500_000_000),
          borrowedRaw: 0n,
          depositedUsd: 50,
          borrowedUsd: 0,
          isStale: false,
          lastSyncAt: new Date(),
        },
      ]);

      const result = await service.assertWithdrawable(
        mockUserId,
        mockAssetId,
        100_000_000,
      );

      expect(result.allowed).toBe(false);
      expect(result.errorKind).toBe(SolvencyErrorKind.INSUFFICIENT_DEPOSIT);
    });

    it('rejects withdrawal with stale oracle price (ORACLE_UNAVAILABLE)', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          assetId: mockAssetId,
          asset: { code: 'XLM', decimals: 7, minCollateralRatio: 0.7 },
          depositedRaw: BigInt(1_000_000_0000000),
          borrowedRaw: BigInt(500_000_000),
          depositedUsd: 120,
          borrowedUsd: 50,
          isStale: true,
          lastSyncAt: new Date(Date.now() - 600_000),
        },
      ]);

      const result = await service.assertWithdrawable(
        mockUserId,
        mockAssetId,
        100_000_000,
      );

      expect(result.allowed).toBe(false);
      expect(result.errorKind).toBe(SolvencyErrorKind.ORACLE_UNAVAILABLE);
      expect(result.stalePrices).toContain('XLM');
    });

    it('returns correct error details for INSUFFICIENT_COLLATERAL', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          assetId: 'asset-xlm',
          asset: { code: 'XLM', decimals: 7, minCollateralRatio: 0.7 },
          depositedRaw: BigInt(1_000_000_0000000),
          borrowedRaw: 0n,
          depositedUsd: 120,
          borrowedUsd: 0,
          isStale: false,
          lastSyncAt: new Date(),
        },
        {
          assetId: 'asset-usdc',
          asset: { code: 'USDC', decimals: 7, minCollateralRatio: 0.8 },
          depositedRaw: 0n,
          borrowedRaw: BigInt(1_100_000_000),
          depositedUsd: 0,
          borrowedUsd: 110,
          isStale: false,
          lastSyncAt: new Date(),
        },
      ]);

      const result = await service.assertWithdrawable(
        mockUserId,
        'asset-xlm',
        100_000_000,
      );

      expect(result.allowed).toBe(false);
      expect(result.errorKind).toBe(SolvencyErrorKind.INSUFFICIENT_COLLATERAL);
      expect(result.detail).toBeDefined();
      expect(result.projectedHealthFactor).toBeLessThan(1.0);
    });
  });

  describe('checkSufficientDeposit', () => {
    it('returns true when deposit is sufficient', () => {
      expect(service.checkSufficientDeposit(1000n, 500)).toBe(true);
      expect(service.checkSufficientDeposit(1000n, 1000)).toBe(true);
    });

    it('returns false when deposit is insufficient', () => {
      expect(service.checkSufficientDeposit(1000n, 1500)).toBe(false);
      expect(service.checkSufficientDeposit(0n, 1)).toBe(false);
    });
  });
});

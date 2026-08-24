import { Prisma } from '@prisma/client';
import { computeAccruedPosition } from './interest-math.util';
import { MarketsService } from '../../markets/markets.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Interest Math Conformance', () => {
  describe('computeAccruedPosition', () => {
    it('returns original values when zero elapsed time (indices match)', () => {
      const res = computeAccruedPosition(
        1000n,
        500n,
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.0),
      );
      expect(res.adjustedDeposited).toBe(1000n);
      expect(res.adjustedBorrowed).toBe(500n);
    });

    it('accrues properly when utilization is below kink', () => {
      // Let's say index doubled
      const res = computeAccruedPosition(
        1000n,
        500n,
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(2.0), // 100% growth
        new Prisma.Decimal(2.0), // 100% growth
      );
      expect(res.adjustedDeposited).toBe(2000n);
      expect(res.adjustedBorrowed).toBe(1000n);
    });

    it('handles precision accurately without rounding down relative to contract', () => {
      // If growth is 0.5 (50%), 1000n -> 1500n, 500n -> 750n
      const res = computeAccruedPosition(
        1000n,
        500n,
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.0),
        new Prisma.Decimal(1.5),
        new Prisma.Decimal(1.5),
      );
      expect(res.adjustedDeposited).toBe(1500n);
      expect(res.adjustedBorrowed).toBe(750n);
    });

    it('returns original values when snapshots are zero or negative', () => {
      const res = computeAccruedPosition(
        1000n,
        500n,
        new Prisma.Decimal(0),
        new Prisma.Decimal(-1.0),
        new Prisma.Decimal(2.0),
        new Prisma.Decimal(2.0),
      );
      expect(res.adjustedDeposited).toBe(1000n);
      expect(res.adjustedBorrowed).toBe(500n);
    });
  });

  describe('MarketsService APY Math', () => {
    let service: MarketsService;

    beforeEach(() => {
      // Mock PrismaService
      service = new MarketsService({} as PrismaService);
    });

    it('pins a known rate -> APY conversion for 20% simple interest (2000 bps)', () => {
      const annualBps = 2000;
      const apy = service.computeApy(annualBps);
      // 20% compounded continuously is exp(0.2) - 1 ≈ 22.14%
      // But we compound per second: (1 + 0.2/31536000)^31536000 - 1
      expect(apy).toBeCloseTo(0.221402758, 6);
    });

    it('pins a known rate -> APY conversion for 5% simple interest (500 bps)', () => {
      const annualBps = 500;
      const apy = service.computeApy(annualBps);
      // 5% compounded continuously is exp(0.05) - 1 ≈ 5.127%
      expect(apy).toBeCloseTo(0.051271096, 6);
    });

    it('calculates computeMarket properly for utilization below kink', () => {
      const state = {
        assetId: '1',
        totalSupplied: 1000n,
        totalBorrowed: 500n, // 50% util
        protocolFees: 0n,
        lastAccrualAt: new Date(),
      };
      const params = {
        baseRateBps: 0,
        kinkUtilBps: 8000,
        slope1Bps: 2000,
        slope2Bps: 0,
        reserveFactorBps: 0,
      };

      const market = service.computeMarket(state, params);
      expect(market.utilizationBps).toBe(5000);

      // borrow annual bps = 0 + 2000 * 5000 / 10000 = 1000
      expect(market.borrowApy).toBeCloseTo(0.105170918, 6); // exp(0.1) - 1

      // supply annual bps = 1000 * 5000 * 10000 / 100_000_000 = 500
      expect(market.supplyApy).toBeCloseTo(0.051271096, 6); // exp(0.05) - 1
    });

    it('calculates computeMarket properly for utilization above kink', () => {
      const state = {
        assetId: '1',
        totalSupplied: 1000n,
        totalBorrowed: 900n, // 90% util
        protocolFees: 0n,
        lastAccrualAt: new Date(),
      };
      const params = {
        baseRateBps: 0,
        kinkUtilBps: 8000,
        slope1Bps: 2000,
        slope2Bps: 4000,
        reserveFactorBps: 0,
      };

      const market = service.computeMarket(state, params);
      expect(market.utilizationBps).toBe(9000);

      // borrow annual = 0 + 2000 * 8000 / 10000 + 4000 * 1000 / 10000 = 1600 + 400 = 2000
      expect(market.borrowApy).toBeCloseTo(0.221402758, 6); // exp(0.2) - 1
    });

    it('calculates computeMarket properly with non-zero reserveFactor', () => {
      const state = {
        assetId: '1',
        totalSupplied: 1000n,
        totalBorrowed: 500n, // 50% util
        protocolFees: 0n,
        lastAccrualAt: new Date(),
      };
      const params = {
        baseRateBps: 0,
        kinkUtilBps: 8000,
        slope1Bps: 2000,
        slope2Bps: 0,
        reserveFactorBps: 1000, // 10%
      };

      const market = service.computeMarket(state, params);
      // supply annual without reserve = 500 bps
      // with 10% reserve, it's 450 bps
      expect(market.supplyApy).toBeCloseTo(0.046027, 4); // ~exp(0.045) - 1
    });
  });
});

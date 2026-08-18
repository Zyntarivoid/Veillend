import {
  computeHealthFactor,
  PositionLike,
} from '../common/utils/health-factor.util';
import { Test, TestingModule } from '@nestjs/testing';
import { PortfoliosService } from './portfolios.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Health Factor Simulation & Integration', () => {
  describe('computeHealthFactor Reference Mathematical Checks', () => {
    it('generates 50 random positions and cross-checks HF tolerance against manual math (1 stroop = 1e-7)', () => {
      for (let i = 0; i < 50; i++) {
        // Random deposit, borrow, mcr
        const depUsd = Math.random() * 10000;
        const borUsd = Math.random() * 5000;
        const mcr = 0.5 + Math.random() * 0.45; // 0.5 to 0.95

        const positions: PositionLike[] = [
          {
            assetId: 'asset-rand',
            assetCode: 'RAND',
            depositedUsd: depUsd,
            borrowedUsd: borUsd,
            asset: { minCollateralRatio: mcr },
          },
        ];

        const result = computeHealthFactor(positions);

        const expectedHf = borUsd === 0 ? Infinity : (depUsd * mcr) / borUsd;

        if (expectedHf === Infinity) {
          expect(result.healthFactor).toBe(Infinity);
        } else {
          expect(
            Math.abs(result.healthFactor! - expectedHf),
          ).toBeLessThanOrEqual(1e-7);
        }
      }
    });

    it('hand-calculated two-collateral, one-borrow case (XLM mcr=0.7, ETH mcr=0.65) produces the exact expected HF value', () => {
      const positions: PositionLike[] = [
        {
          assetId: 'asset-xlm',
          assetCode: 'XLM',
          depositedUsd: 1000,
          borrowedUsd: 0,
          asset: { minCollateralRatio: 0.7 },
        },
        {
          assetId: 'asset-eth',
          assetCode: 'ETH',
          depositedUsd: 2000,
          borrowedUsd: 500,
          asset: { minCollateralRatio: 0.65 },
        },
      ];

      const result = computeHealthFactor(positions);

      const expectedWeightedCollateral = 1000 * 0.7 + 2000 * 0.65; // 700 + 1300 = 2000
      const expectedTotalBorrowed = 500;
      const expectedHf = expectedWeightedCollateral / expectedTotalBorrowed; // 2000 / 500 = 4

      expect(result.healthFactor).toBeCloseTo(expectedHf, 7);
      expect(result.totalWeightedCollateralUsd).toBeCloseTo(2000, 7);
      expect(result.totalBorrowedUsd).toBeCloseTo(500, 7);
    });

    it('stale price for any asset that backs a live position returns healthFactor: null and lists the offending code in stalePrices', () => {
      const positions: PositionLike[] = [
        {
          assetId: 'asset-xlm',
          assetCode: 'XLM',
          depositedUsd: 1000,
          borrowedUsd: 500,
          asset: { minCollateralRatio: 0.7 },
          isStale: true,
        },
      ];

      const result = computeHealthFactor(
        positions,
        {},
        {},
        { allowStale: false },
      );

      expect(result.isStale).toBe(true);
      expect(result.healthFactor).toBeNull();
      expect(result.stalePrices).toContain('XLM');
    });
  });

  describe('PortfoliosService Bad Debt Simulation', () => {
    let service: PortfoliosService;
    const WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
      position: {
        findMany: jest.fn(),
      },
      transactionHistory: {
        findMany: jest.fn(),
      },
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PortfoliosService,
          { provide: PrismaService, useValue: mockPrismaService },
        ],
      }).compile();

      service = module.get<PortfoliosService>(PortfoliosService);
      jest.clearAllMocks();
    });

    it('bad-debt totals accumulated from synthetic liquidation fixtures are correctly attributed per-user and surfaced on the portfolio object', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        walletAddress: WALLET,
      });

      mockPrismaService.position.findMany.mockResolvedValue([
        {
          assetId: 'asset-usdc',
          asset: {
            code: 'USDC',
            symbol: 'USDC',
            decimals: 7,
            minCollateralRatio: 0.8,
          },
          depositedRaw: 1_000_0000000n,
          borrowedRaw: 1_200_0000000n,
          depositedUsd: 1000,
          borrowedUsd: 1200,
          healthFactor: 0.66,
          privacyMode: false,
          isStale: false,
        },
      ]);

      // Synthetic liquidation fixtures simulating bad debt accumulation
      mockPrismaService.transactionHistory.findMany.mockResolvedValue([
        { id: 'tx1', type: 'LIQUIDATION', userId: 'user-1', badDebtUsd: 150.5 },
        { id: 'tx2', type: 'LIQUIDATION', userId: 'user-1', badDebtUsd: 50.25 },
        { id: 'tx3', type: 'DEPOSIT', userId: 'user-1' }, // Should be ignored by where clause anyway
      ]);

      const result = await service.getPortfolio(WALLET);

      // Expected bad debt = 150.5 + 50.25 = 200.75
      expect(result.badDebtUsd).toBeCloseTo(200.75, 5);

      // Expected HF Ex Bad Debt = (1000 * 0.8) / 1200 = 800 / 1200 = 0.66666...
      expect(result.hfExBadDebt).toBeCloseTo(800 / 1200, 5);

      // Expected HF With Bad Debt = (1000 * 0.8) / (1200 + 200.75) = 800 / 1400.75 = 0.57112...
      expect(result.hfWithBadDebt).toBeCloseTo(800 / 1400.75, 5);

      // The overall health factor used by standard fields is the hfExBadDebt in our computeHealthFactor logic
      expect(result.healthFactor).toBeCloseTo(800 / 1200, 5);
    });
  });
});

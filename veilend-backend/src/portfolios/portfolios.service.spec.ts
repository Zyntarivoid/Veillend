/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { PrismaService } from '../prisma/prisma.service';

const WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

describe('PortfoliosService', () => {
  let service: PortfoliosService;

  const mockPrismaService = {
    // Passthrough: runs the callback with the mock itself so unit tests can
    // set up return values on mockPrismaService.user / .position directly.
    withRepeatableRead: jest.fn(
      async (fn: (db: typeof mockPrismaService) => Promise<unknown>) =>
        fn(mockPrismaService),
    ),
    user: {
      findUnique: jest.fn(),
    },
    position: {
      findMany: jest.fn(),
    },
    transactionHistory: {
      findMany: jest.fn().mockResolvedValue([]),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws NotFoundException when the wallet has no indexed user record', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.getPortfolio(WALLET)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aggregates collateral/debt across positions and computes MCR-weighted health factor', async () => {
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
        borrowedRaw: 400_0000000n,
        depositedUsd: 1000,
        borrowedUsd: 400,
        healthFactor: 2.0,
        privacyMode: false,
        isStale: false,
      },
      {
        assetId: 'asset-xlm',
        asset: {
          code: 'XLM',
          symbol: 'XLM',
          decimals: 7,
          minCollateralRatio: 0.7,
        },
        depositedRaw: 500_0000000n,
        borrowedRaw: 0n,
        depositedUsd: 100,
        borrowedUsd: 0,
        healthFactor: null,
        privacyMode: false,
        isStale: false,
      },
    ]);

    const result = await service.getPortfolio(WALLET);

    expect(result.walletAddress).toBe(WALLET);
    expect(result.collateralValue).toBe(1100);
    expect(result.borrowedValue).toBe(400);
    // Weighted collateral = 1000 * 0.8 + 100 * 0.7 = 800 + 70 = 870
    // HF = 870 / 400 = 2.175
    expect(result.healthFactor).toBeCloseTo(870 / 400);
    expect(result.availableToBorrow).toBeCloseTo(870 - 400);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toMatchObject({
      assetCode: 'USDC',
      deposited: 1000,
      borrowed: 400,
    });
    expect(result.positions[1].healthFactor).toBeNull();
  });

  it('marks healthFactor as null when any position has stale oracle prices without allowStale', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-xlm',
        asset: {
          code: 'XLM',
          symbol: 'XLM',
          decimals: 7,
          minCollateralRatio: 0.7,
        },
        depositedRaw: 100_0000000n,
        borrowedRaw: 50_0000000n,
        depositedUsd: 100,
        borrowedUsd: 50,
        healthFactor: 1.4,
        privacyMode: false,
        isStale: true,
      },
    ]);

    const result = await service.getPortfolio(WALLET);
    expect(result.isStale).toBe(true);
    expect(result.stalePrices).toContain('XLM');
    expect(result.healthFactor).toBeNull();
  });

  it('returns best-effort healthFactor when allowStale: true is passed', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-xlm',
        asset: {
          code: 'XLM',
          symbol: 'XLM',
          decimals: 7,
          minCollateralRatio: 0.7,
        },
        depositedRaw: 100_0000000n,
        borrowedRaw: 50_0000000n,
        depositedUsd: 100,
        borrowedUsd: 50,
        healthFactor: 1.4,
        privacyMode: false,
        isStale: true,
      },
    ]);

    const result = await service.getPortfolio(WALLET, { allowStale: true });
    expect(result.isStale).toBe(true);
    expect(result.healthFactor).toBeCloseTo(70 / 50);
  });

  it('returns healthFactor of Infinity when there is no debt', async () => {
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
        depositedRaw: 100_0000000n,
        borrowedRaw: 0n,
        depositedUsd: 100,
        borrowedUsd: 0,
        healthFactor: null,
        privacyMode: false,
        isStale: false,
      },
    ]);

    const result = await service.getPortfolio(WALLET);

    expect(result.healthFactor).toBe(Infinity);
    expect(result.availableToBorrow).toBe(80);
  });

  it('clamps availableToBorrow to 0 when borrowed exceeds weighted collateral', async () => {
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
        depositedRaw: 100_0000000n,
        borrowedRaw: 200_0000000n,
        depositedUsd: 100,
        borrowedUsd: 200,
        healthFactor: 0.4,
        privacyMode: false,
        isStale: false,
      },
    ]);

    const result = await service.getPortfolio(WALLET);

    expect(result.availableToBorrow).toBe(0);
  });
});

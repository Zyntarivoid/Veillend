import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { PrismaService } from '../prisma/prisma.service';

const WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

describe('PortfoliosService', () => {
  let service: PortfoliosService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    position: {
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws NotFoundException when the wallet has no indexed user record', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.getPortfolio(WALLET)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aggregates collateral/debt across positions and formats raw amounts using asset decimals', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-usdc',
        asset: { code: 'USDC', symbol: 'USDC', decimals: 7 },
        depositedRaw: 1_000_0000000n, // 1000.0000000 -> 1000 with 7 decimals
        borrowedRaw: 400_0000000n,
        depositedUsd: 1000,
        borrowedUsd: 400,
        healthFactor: 2.5,
        privacyMode: false,
        isStale: false,
      },
      {
        assetId: 'asset-xlm',
        asset: { code: 'XLM', symbol: 'XLM', decimals: 7 },
        depositedRaw: 500_0000000n,
        borrowedRaw: 0n,
        depositedUsd: 100,
        borrowedUsd: 0,
        healthFactor: null,
        privacyMode: false,
        isStale: true,
      },
    ]);

    const result = await service.getPortfolio(WALLET);

    expect(result.walletAddress).toBe(WALLET);
    expect(result.collateralValue).toBe(1100);
    expect(result.borrowedValue).toBe(400);
    expect(result.availableToBorrow).toBe(700);
    expect(result.healthFactor).toBeCloseTo(1100 / 400);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toMatchObject({
      assetCode: 'USDC',
      deposited: 1000,
      borrowed: 400,
    });
    expect(result.positions[1].healthFactor).toBeNull();
  });

  it('returns healthFactor of Infinity and availableToBorrow clamped at 0 when there is no debt', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-usdc',
        asset: { code: 'USDC', symbol: 'USDC', decimals: 7 },
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
    expect(result.availableToBorrow).toBe(100);
  });

  it('clamps availableToBorrow to 0 when borrowed exceeds collateral', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-usdc',
        asset: { code: 'USDC', symbol: 'USDC', decimals: 7 },
        depositedRaw: 100_0000000n,
        borrowedRaw: 200_0000000n,
        depositedUsd: 100,
        borrowedUsd: 200,
        healthFactor: 0.5,
        privacyMode: false,
        isStale: false,
      },
    ]);

    const result = await service.getPortfolio(WALLET);

    expect(result.availableToBorrow).toBe(0);
  });
});

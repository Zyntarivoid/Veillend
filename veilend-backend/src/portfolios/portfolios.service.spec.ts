import { BadRequestException } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { HorizonService } from '../stellar/horizon.service';
import { PrismaService } from '../prisma/prisma.service';

/** Well-formed Ed25519 public key for tests (not a real funded account). */
const VALID_WALLET =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('PortfoliosService', () => {
  let service: PortfoliosService;
  let horizon: { getClient: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    horizon = {
      getClient: jest.fn(),
    };
    prisma = {
      user: { findUnique: jest.fn() },
    };
    service = new PortfoliosService(
      horizon as unknown as HorizonService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects invalid wallet addresses', async () => {
    await expect(service.getPortfolio('not-a-wallet')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns a graceful empty state when Horizon account is missing', async () => {
    const notFound = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    });
    horizon.getClient.mockReturnValue({
      loadAccount: jest.fn().mockRejectedValue(notFound),
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const data = await service.getPortfolio(VALID_WALLET);

    expect(data.empty).toBe(true);
    expect(data.walletAddress).toBe(VALID_WALLET);
    expect(data.balance).toBe(0);
    expect(data.balances).toEqual([]);
    expect(data.positions).toEqual([]);
    expect(data.healthFactor).toBeNull();
    expect(data.source.horizon).toBe(false);
    expect(data.source.protocol).toBe(false);
  });

  it('maps Horizon balances for a funded account', async () => {
    horizon.getClient.mockReturnValue({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [
          { asset_type: 'native', balance: '12.5' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GISSUER',
            balance: '3.25',
          },
        ],
      }),
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const data = await service.getPortfolio(VALID_WALLET);

    expect(data.empty).toBe(false);
    expect(data.balance).toBe(12.5);
    expect(data.balances).toEqual([
      { asset: 'XLM', balance: 12.5, issuer: null },
      { asset: 'USDC', balance: 3.25, issuer: 'GISSUER' },
    ]);
    expect(data.source.horizon).toBe(true);
  });

  it('aggregates protocol positions into collateral and borrow metrics', async () => {
    horizon.getClient.mockReturnValue({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [{ asset_type: 'native', balance: '1' }],
      }),
    });
    prisma.user.findUnique.mockResolvedValue({
      positions: [
        {
          depositedRaw: 1000n,
          borrowedRaw: 200n,
          depositedUsd: 100,
          borrowedUsd: 40,
          healthFactor: 2.5,
          isStale: false,
          asset: { code: 'USDC', contractId: 'CABC' },
        },
        {
          depositedRaw: 500n,
          borrowedRaw: 0n,
          depositedUsd: 50,
          borrowedUsd: 0,
          healthFactor: null,
          isStale: true,
          asset: { code: 'XLM', contractId: null },
        },
      ],
    });

    const data = await service.getPortfolio(VALID_WALLET);

    expect(data.collateralValue).toBe(150);
    expect(data.borrowedValue).toBe(40);
    expect(data.availableToBorrow).toBe(110);
    expect(data.healthFactor).toBeCloseTo(150 / 40);
    expect(data.positions).toHaveLength(2);
    expect(data.positions[0]).toMatchObject({
      assetCode: 'USDC',
      depositedRaw: '1000',
      borrowedRaw: '200',
    });
    expect(data.source.protocol).toBe(true);
  });
});

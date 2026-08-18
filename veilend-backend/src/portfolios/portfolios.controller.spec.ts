import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

const OWN_WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';
const OTHER_WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

function mockRequest(walletAddress: string): AuthenticatedRequest {
  return {
    user: { walletAddress, sessionId: 'session-1', expiresAt: new Date() },
  } as AuthenticatedRequest;
}

describe('PortfoliosController', () => {
  let controller: PortfoliosController;

  const mockPortfoliosService = {
    getPortfolio: jest.fn(),
  };

  const mockPrismaService = {
    admin: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfoliosController],
      providers: [
        { provide: PortfoliosService, useValue: mockPortfoliosService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<PortfoliosController>(PortfoliosController);
    jest.clearAllMocks();
  });

  it('allows a user to fetch their own portfolio', async () => {
    mockPortfoliosService.getPortfolio.mockResolvedValue({
      walletAddress: OWN_WALLET,
    });

    const result = await controller.getPortfolio(
      { walletAddress: OWN_WALLET },
      mockRequest(OWN_WALLET),
    );

    expect(result).toEqual({ walletAddress: OWN_WALLET });
    expect(mockPrismaService.admin.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-admin requesting another wallet's portfolio with 403", async () => {
    mockPrismaService.admin.findUnique.mockResolvedValue(null);

    await expect(
      controller.getPortfolio(
        { walletAddress: OTHER_WALLET },
        mockRequest(OWN_WALLET),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPortfoliosService.getPortfolio).not.toHaveBeenCalled();
  });

  it("allows an admin to fetch any wallet's portfolio", async () => {
    mockPrismaService.admin.findUnique.mockResolvedValue({
      id: 'admin-1',
      walletAddress: OWN_WALLET,
    });
    mockPortfoliosService.getPortfolio.mockResolvedValue({
      walletAddress: OTHER_WALLET,
    });

    const result = await controller.getPortfolio(
      { walletAddress: OTHER_WALLET },
      mockRequest(OWN_WALLET),
    );

    expect(result).toEqual({ walletAddress: OTHER_WALLET });
  });
});

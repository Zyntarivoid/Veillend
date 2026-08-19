/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { Order } from '../common/dto/page-options.dto';

const WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const mockPrismaService = {
    // Passthrough: runs the callback with the mock itself so unit tests can
    // set up return values on mockPrismaService.user / .transactionHistory directly.
    withRepeatableRead: jest.fn(
      async (fn: (db: typeof mockPrismaService) => Promise<unknown>) =>
        fn(mockPrismaService),
    ),
    user: {
      findUnique: jest.fn(),
    },
    transactionHistory: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws NotFoundException when the wallet has no indexed user record', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getTransactions(WALLET, {
        page: 1,
        take: 10,
        order: Order.ASC,
        skip: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('paginates TransactionHistory and formats amounts using asset decimals', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.transactionHistory.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.CONFIRMED,
        amountRaw: 250_0000000n,
        amountUsd: 250,
        asset: { code: 'USDC', symbol: 'USDC', decimals: 7 },
        txHash: 'hash-1',
        ledgerSequence: 12345,
        sorobanEventId: 'event-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        confirmedAt: new Date('2026-01-01T00:00:05Z'),
      },
    ]);
    mockPrismaService.transactionHistory.count.mockResolvedValue(1);

    const result = await service.getTransactions(WALLET, {
      page: 1,
      take: 10,
      order: Order.DESC,
      skip: 0,
    });

    expect(mockPrismaService.transactionHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'tx-1',
      amount: 250,
      amountUsd: 250,
      assetCode: 'USDC',
      txHash: 'hash-1',
      ledgerSequence: 12345,
      sorobanEventId: 'event-1',
    });
    expect(result.meta.itemCount).toBe(1);
  });

  it('applies the optional type filter', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET,
    });
    mockPrismaService.transactionHistory.findMany.mockResolvedValue([]);
    mockPrismaService.transactionHistory.count.mockResolvedValue(0);

    await service.getTransactions(WALLET, {
      page: 1,
      take: 10,
      order: Order.ASC,
      skip: 0,
      type: TransactionType.BORROW,
    });

    expect(mockPrismaService.transactionHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', type: TransactionType.BORROW },
      }),
    );
  });
});

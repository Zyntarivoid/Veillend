import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: { getTransactions: jest.Mock };
  let prisma: { admin: { findUnique: jest.Mock } };

  beforeEach(async () => {
    service = { getTransactions: jest.fn() };
    prisma = { admin: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: service },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  it('GET /transactions/:walletAddress delegates to TransactionsService with query params', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
    };
    const mockQuery = {
      order: 'DESC',
      skip: 0,
      take: 50,
    } as unknown as GetTransactionsQueryDto;
    service.getTransactions.mockResolvedValue(mockResponse);

    const req = {
      user: { walletAddress: 'GABC' },
    } as AuthenticatedRequest;

    const result = await controller.getTransactions(
      { walletAddress: 'GABC' },
      mockQuery,
      req,
    );

    expect(service.getTransactions).toHaveBeenCalledWith('GABC', mockQuery);
    expect(result).toEqual(mockResponse);
  });
});

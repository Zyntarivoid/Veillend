import { Test, TestingModule } from '@nestjs/testing';
import { AdminActionRepository } from './admin-action.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActionStatus, AdminActionType } from '@prisma/client';

describe('AdminActionRepository', () => {
  let repository: AdminActionRepository;

  const mockPrismaService = {
    adminAction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminActionRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<AdminActionRepository>(AdminActionRepository);
    jest.clearAllMocks();
  });

  it('should create a PENDING intent', async () => {
    const input = {
      adminAddress: 'GADMIN',
      action: AdminActionType.CONFIGURE_ASSET,
      payload: { assetContractId: 'CASSET', supported: true },
    };
    mockPrismaService.adminAction.create.mockResolvedValue({
      id: 'a1',
      ...input,
      status: AdminActionStatus.PENDING,
    });

    await repository.create(input);

    expect(mockPrismaService.adminAction.create).toHaveBeenCalledWith({
      data: {
        adminAddress: 'GADMIN',
        action: AdminActionType.CONFIGURE_ASSET,
        payload: input.payload,
        status: AdminActionStatus.PENDING,
      },
    });
  });

  it('should mark an action as SENT with the txHash', async () => {
    mockPrismaService.adminAction.update.mockResolvedValue({});

    await repository.markSent('a1', 'abc123');

    expect(mockPrismaService.adminAction.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: {
        status: AdminActionStatus.SENT,
        txHash: 'abc123',
        submittedAt: expect.any(Date) as Date,
      },
    });
  });

  it('should mark an action as CONFIRMED', async () => {
    mockPrismaService.adminAction.update.mockResolvedValue({});

    await repository.markConfirmed('a1');

    expect(mockPrismaService.adminAction.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: {
        status: AdminActionStatus.CONFIRMED,
        confirmedAt: expect.any(Date) as Date,
      },
    });
  });

  it('should mark an action as FAILED with an error message', async () => {
    mockPrismaService.adminAction.update.mockResolvedValue({});

    await repository.markFailed('a1', 'boom');

    expect(mockPrismaService.adminAction.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: AdminActionStatus.FAILED, error: 'boom' },
    });
  });

  it('should find submitted actions with a txHash', async () => {
    mockPrismaService.adminAction.findMany.mockResolvedValue([]);

    await repository.findSubmitted();

    expect(mockPrismaService.adminAction.findMany).toHaveBeenCalledWith({
      where: {
        status: AdminActionStatus.SENT,
        txHash: { not: null },
      },
    });
  });
});

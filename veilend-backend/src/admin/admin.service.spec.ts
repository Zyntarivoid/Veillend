import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActionRepository } from './admin-action.repository';
import { AdminTransactionBuilderService } from './admin-transaction-builder.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionStatus, AdminActionType } from '@prisma/client';
import { Order } from '../common/dto/page-options.dto';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    admin: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    session: {
      deleteMany: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockAdminActionRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    updateXdr: jest.fn(),
    markSent: jest.fn(),
    markConfirmed: jest.fn(),
    markFailed: jest.fn(),
    findSubmitted: jest.fn(),
  };

  const mockTransactionBuilder = {
    buildActionXdr: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AdminActionRepository,
          useValue: mockAdminActionRepository,
        },
        {
          provide: AdminTransactionBuilderService,
          useValue: mockTransactionBuilder,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addAdmin', () => {
    it('should create admin and log the action in a transaction', async () => {
      const dto = { walletAddress: '0xABCD1234' };
      const actorWallet = '0xACTOR123';
      const mockAdmin = { id: 'admin-1', ...dto, createdAt: new Date() };

      mockPrismaService.$transaction.mockImplementation((callback: any) => {
        const txMock = {
          admin: {
            create: jest.fn().mockResolvedValue(mockAdmin),
          },
          adminAuditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return callback(txMock);
      });

      const result = await service.addAdmin(dto, actorWallet);

      expect(result).toEqual(mockAdmin);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('removeAdmin', () => {
    it('should delete admin, revoke sessions, and log action when user exists', async () => {
      const walletAddress = '0xABCD1234';
      const actorWallet = '0xACTOR123';
      const mockUser = { id: 'user-1', walletAddress };
      const mockAdmin = { id: 'admin-1', walletAddress, createdAt: new Date() };

      mockPrismaService.$transaction.mockImplementation((callback: any) => {
        const txMock = {
          user: {
            findUnique: jest.fn().mockResolvedValue(mockUser),
          },
          session: {
            deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
          admin: {
            delete: jest.fn().mockResolvedValue(mockAdmin),
          },
          adminAuditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return callback(txMock);
      });

      const result = await service.removeAdmin(walletAddress, actorWallet);

      expect(result).toEqual(mockAdmin);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should delete admin and log action even when user does not exist', async () => {
      const walletAddress = '0xABCD1234';
      const actorWallet = '0xACTOR123';
      const mockAdmin = { id: 'admin-1', walletAddress, createdAt: new Date() };

      mockPrismaService.$transaction.mockImplementation((callback: any) => {
        const txMock = {
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
          session: {
            deleteMany: jest.fn(),
          },
          admin: {
            delete: jest.fn().mockResolvedValue(mockAdmin),
          },
          adminAuditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return callback(txMock);
      });

      const result = await service.removeAdmin(walletAddress, actorWallet);

      expect(result).toEqual(mockAdmin);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('listAdmins', () => {
    it('should return all admins', async () => {
      const mockAdmins = [
        { id: 'admin-1', walletAddress: '0xABCD1234', createdAt: new Date() },
        { id: 'admin-2', walletAddress: '0xEFGH5678', createdAt: new Date() },
      ];

      mockPrismaService.admin.findMany.mockResolvedValue(mockAdmins);

      const result = await service.listAdmins();

      expect(result).toEqual(mockAdmins);
      expect(mockPrismaService.admin.findMany).toHaveBeenCalled();
    });
  });

  describe('configureAsset', () => {
    const actorWallet =
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const dto = {
      assetContractId:
        'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5',
      supported: true,
    };

    it('should create three distinct PENDING rows for three dispatches', async () => {
      const pendingRow = (id: string) => ({
        id,
        adminAddress: actorWallet,
        action: AdminActionType.CONFIGURE_ASSET,
        payload: dto,
        status: AdminActionStatus.PENDING,
      });

      mockAdminActionRepository.create
        .mockResolvedValueOnce(pendingRow('a1'))
        .mockResolvedValueOnce(pendingRow('a2'))
        .mockResolvedValueOnce(pendingRow('a3'));
      mockTransactionBuilder.buildActionXdr.mockResolvedValue('AAAA...xdr');

      const first = await service.configureAsset(dto, actorWallet);
      const second = await service.configureAsset(dto, actorWallet);
      const third = await service.configureAsset(dto, actorWallet);

      expect(mockAdminActionRepository.create).toHaveBeenCalledTimes(3);
      expect(mockAdminActionRepository.create).toHaveBeenCalledWith({
        adminAddress: actorWallet,
        action: AdminActionType.CONFIGURE_ASSET,
        payload: {
          assetContractId: dto.assetContractId,
          supported: dto.supported,
        },
      });
      // Three distinct action ids, each with a built XDR handoff.
      expect(
        new Set([first.actionId, second.actionId, third.actionId]).size,
      ).toBe(3);
      expect(first.xdr).toBe('AAAA...xdr');
      expect(mockTransactionBuilder.buildActionXdr).toHaveBeenCalledTimes(3);
      expect(mockAdminActionRepository.updateXdr).toHaveBeenCalledTimes(3);
    });

    it('should mark the intent FAILED and rethrow when XDR building fails', async () => {
      mockAdminActionRepository.create.mockResolvedValue({
        id: 'a1',
        adminAddress: actorWallet,
        action: AdminActionType.CONFIGURE_ASSET,
        status: AdminActionStatus.PENDING,
      });
      mockTransactionBuilder.buildActionXdr.mockRejectedValue(
        new Error('account not found'),
      );

      await expect(service.configureAsset(dto, actorWallet)).rejects.toThrow(
        'account not found',
      );
      expect(mockAdminActionRepository.markFailed).toHaveBeenCalledWith(
        'a1',
        'account not found',
      );
    });
  });

  describe('setOraclePrice', () => {
    it('should dispatch a SET_ORACLE_PRICE intent with the price payload', async () => {
      const actorWallet =
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const dto = {
        assetContractId:
          'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5',
        price: 100,
      };
      mockAdminActionRepository.create.mockResolvedValue({
        id: 'o1',
        adminAddress: actorWallet,
        action: AdminActionType.SET_ORACLE_PRICE,
        status: AdminActionStatus.PENDING,
      });
      mockTransactionBuilder.buildActionXdr.mockResolvedValue('AAAA...xdr');

      const result = await service.setOraclePrice(dto, actorWallet);

      expect(result).toEqual({ actionId: 'o1', xdr: 'AAAA...xdr' });
      expect(mockAdminActionRepository.create).toHaveBeenCalledWith({
        adminAddress: actorWallet,
        action: AdminActionType.SET_ORACLE_PRICE,
        payload: { assetContractId: dto.assetContractId, price: dto.price },
      });
    });
  });

  describe('setMinCollateralRatio', () => {
    it('should dispatch a SET_MIN_COLLATERAL_RATIO intent', async () => {
      const actorWallet =
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const dto = { minCollateralRatioBps: 15000 };
      mockAdminActionRepository.create.mockResolvedValue({
        id: 'm1',
        adminAddress: actorWallet,
        action: AdminActionType.SET_MIN_COLLATERAL_RATIO,
        status: AdminActionStatus.PENDING,
      });
      mockTransactionBuilder.buildActionXdr.mockResolvedValue('AAAA...xdr');

      const result = await service.setMinCollateralRatio(dto, actorWallet);

      expect(result).toEqual({ actionId: 'm1', xdr: 'AAAA...xdr' });
      expect(mockAdminActionRepository.create).toHaveBeenCalledWith({
        adminAddress: actorWallet,
        action: AdminActionType.SET_MIN_COLLATERAL_RATIO,
        payload: { minCollateralRatioBps: dto.minCollateralRatioBps },
      });
    });
  });

  describe('submitTransaction', () => {
    const actorWallet =
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const txHash = 'a'.repeat(64);

    it('should mark a pending action as SENT on successful submission', async () => {
      mockAdminActionRepository.findById.mockResolvedValue({
        id: 'a1',
        adminAddress: actorWallet,
        status: AdminActionStatus.PENDING,
      });
      mockAdminActionRepository.markSent.mockResolvedValue({
        id: 'a1',
        status: AdminActionStatus.SENT,
        txHash,
      });

      const result = await service.submitTransaction('a1', txHash, actorWallet);

      expect(mockAdminActionRepository.markSent).toHaveBeenCalledWith(
        'a1',
        txHash,
      );
      expect(result.status).toBe(AdminActionStatus.SENT);
    });

    it('should throw NotFound when the action does not exist', async () => {
      mockAdminActionRepository.findById.mockResolvedValue(null);

      await expect(
        service.submitTransaction('missing', txHash, actorWallet),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw Forbidden when the requester is not the action admin', async () => {
      mockAdminActionRepository.findById.mockResolvedValue({
        id: 'a1',
        adminAddress: 'GOTHERADMIN',
        status: AdminActionStatus.PENDING,
      });

      await expect(
        service.submitTransaction('a1', txHash, actorWallet),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw Conflict when the action is not pending', async () => {
      mockAdminActionRepository.findById.mockResolvedValue({
        id: 'a1',
        adminAddress: actorWallet,
        status: AdminActionStatus.CONFIRMED,
      });

      await expect(
        service.submitTransaction('a1', txHash, actorWallet),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getAction', () => {
    it('should return the action by id', async () => {
      const action = { id: 'a1', status: AdminActionStatus.PENDING };
      mockAdminActionRepository.findById.mockResolvedValue(action);

      await expect(service.getAction('a1')).resolves.toEqual(action);
    });

    it('should throw NotFound when the action does not exist', async () => {
      mockAdminActionRepository.findById.mockResolvedValue(null);

      await expect(service.getAction('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAuditLog', () => {
    it('should return paginated audit logs', async () => {
      const pageOptionsDto = {
        page: 1,
        take: 10,
        skip: 0,
        order: Order.DESC,
      };

      const mockLogs = [
        {
          id: 'log-1',
          actorWallet: '0xACTOR123',
          action: AdminActionType.ADD_ADMIN,
          target: '0xNEWADMIN',
          payload: {},
          createdAt: new Date(),
        },
      ];

      mockPrismaService.adminAuditLog.findMany.mockResolvedValue(mockLogs);
      mockPrismaService.adminAuditLog.count.mockResolvedValue(1);

      const result = await service.getAuditLog(pageOptionsDto);

      expect(result.data).toEqual(mockLogs);
      expect(result.meta.itemCount).toBe(1);
      expect(mockPrismaService.adminAuditLog.findMany).toHaveBeenCalledWith({
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});

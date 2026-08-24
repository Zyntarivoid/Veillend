/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawalsService } from './withdrawals.service';
import {
  WithdrawalSolvencyService,
  SolvencyErrorKind,
} from './withdrawal-solvency.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { HorizonService } from '../stellar/horizon.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';

describe('WithdrawalsService', () => {
  let service: WithdrawalsService;
  let prisma: Record<string, any>;
  let solvencyService: {
    assertWithdrawable: jest.Mock;
    checkSufficientDeposit: jest.Mock;
  };
  let configService: Record<string, any>;

  const mockUserId = 'user-123';
  const mockWallet = 'GABC...';

  beforeEach(async () => {
    prisma = {
      asset: { findFirst: jest.fn() },
      position: { findMany: jest.fn(), findUnique: jest.fn() },
      addressWhitelist: { findFirst: jest.fn() },
      assetWithdrawalConfig: { findUnique: jest.fn() },
      withdrawalRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      withdrawNonce: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      idempotencyKey: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      withSerializable: jest
        .fn()
        .mockImplementation((fn: any) => fn(prisma) as Promise<any>),
    };

    solvencyService = {
      assertWithdrawable: jest.fn(),
      checkSufficientDeposit: jest.fn(),
    };

    configService = {
      withdrawals: {
        defaultMinConfirmations: 10,
        timelockHours: 24,
        instantWhitelistMaxUsd: 50,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: configService },
        { provide: HorizonService, useValue: {} },
        { provide: NotificationsService, useValue: { notifyUser: jest.fn() } },
        { provide: WithdrawalSolvencyService, useValue: solvencyService },
      ],
    }).compile();

    service = module.get<WithdrawalsService>(WithdrawalsService);
  });

  describe('createWithdrawal', () => {
    it('creates a withdrawal when solvency check passes', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-xlm',
        code: 'XLM',
        decimals: 7,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: true,
        projectedHealthFactor: Infinity,
        currentHealthFactor: Infinity,
      });
      prisma.addressWhitelist.findFirst.mockResolvedValue(null);
      prisma.assetWithdrawalConfig.findUnique.mockResolvedValue(null);
      prisma.withdrawalRequest.create.mockResolvedValue({
        id: 'wd-123',
        status: WithdrawalStatus.DRAFT,
      });
      prisma.withdrawNonce.create.mockResolvedValue({});
      prisma.idempotencyKey.create.mockResolvedValue({});

      const result = await service.createWithdrawal(mockUserId, mockWallet, {
        assetAddress: 'XLM',
        amountStroops: 100_000_000,
        destinationAddress: 'GDEF...',
      });

      expect(result.id).toBe('wd-123');
      expect(result.status).toBe(WithdrawalStatus.DRAFT);
      expect(solvencyService.assertWithdrawable).toHaveBeenCalledWith(
        mockUserId,
        'asset-xlm',
        100_000_000,
      );
    });

    it('rejects withdrawal with INSUFFICIENT_COLLATERAL', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-xlm',
        code: 'XLM',
        decimals: 7,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: false,
        errorKind: SolvencyErrorKind.INSUFFICIENT_COLLATERAL,
        projectedHealthFactor: 0.85,
        currentHealthFactor: 1.05,
        detail: 'Withdrawal would push health factor below minimum',
      });

      await expect(
        service.createWithdrawal(mockUserId, mockWallet, {
          assetAddress: 'XLM',
          amountStroops: 100_000_000,
          destinationAddress: 'GDEF...',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects withdrawal with ORACLE_UNAVAILABLE', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-xlm',
        code: 'XLM',
        decimals: 7,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: false,
        errorKind: SolvencyErrorKind.ORACLE_UNAVAILABLE,
        detail: 'Oracle prices stale',
        stalePrices: ['XLM'],
        missingPrices: [],
      });

      await expect(
        service.createWithdrawal(mockUserId, mockWallet, {
          assetAddress: 'XLM',
          amountStroops: 100_000_000,
          destinationAddress: 'GDEF...',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing record on idempotent replay within 24h', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 'asset-xlm',
        code: 'XLM',
        decimals: 7,
      });
      prisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'idem-key-1',
        expiresAt: new Date(Date.now() + 3600_000),
        responseJson: {
          id: 'existing-wd',
          status: WithdrawalStatus.DRAFT,
          nonce: 'existing-nonce',
          timelockUntil: null,
        },
      });

      const result = await service.createWithdrawal(
        mockUserId,
        mockWallet,
        {
          assetAddress: 'XLM',
          amountStroops: 100_000_000,
          destinationAddress: 'GDEF...',
        },
        'idem-key-1',
      );

      expect(result.id).toBe('existing-wd');
      expect(result.idempotentReplay).toBe(true);
      expect(solvencyService.assertWithdrawable).not.toHaveBeenCalled();
    });
  });

  describe('submitWithdrawal', () => {
    it('rejects submission when position degraded (REQUIRES_REVALIDATION)', async () => {
      prisma.withdrawalRequest.findFirst.mockResolvedValue({
        id: 'wd-123',
        userId: mockUserId,
        assetId: 'asset-xlm',
        amountStroops: 100_000_000,
        status: WithdrawalStatus.SIGNED,
        timelockUntil: null,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: false,
        errorKind: SolvencyErrorKind.INSUFFICIENT_COLLATERAL,
        projectedHealthFactor: 0.9,
        currentHealthFactor: 1.05,
        detail: 'Position degraded during timelock',
      });
      prisma.withdrawalRequest.update.mockResolvedValue({});

      await expect(
        service.submitWithdrawal('wd-123', mockUserId, 'tx-hash-1'),
      ).rejects.toThrow(ConflictException);

      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith({
        where: { id: 'wd-123' },
        data: {
          status: WithdrawalStatus.REQUIRES_REVALIDATION,
          error: 'Position degraded during timelock',
        },
      });
    });

    it('allows submission when solvency re-check passes', async () => {
      prisma.withdrawalRequest.findFirst.mockResolvedValue({
        id: 'wd-123',
        userId: mockUserId,
        assetId: 'asset-xlm',
        amountStroops: 100_000_000,
        status: WithdrawalStatus.SIGNED,
        timelockUntil: null,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: true,
        projectedHealthFactor: 1.5,
        currentHealthFactor: 1.6,
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wd-123',
        status: WithdrawalStatus.SENT,
      });

      const result = await service.submitWithdrawal(
        'wd-123',
        mockUserId,
        'tx-hash-1',
      );
      expect(result.status).toBe(WithdrawalStatus.SENT);
    });
  });

  describe('revalidateWithdrawal', () => {
    it('transitions REQUIRES_REVALIDATION back to DRAFT when solvent', async () => {
      prisma.withdrawalRequest.findFirst.mockResolvedValue({
        id: 'wd-123',
        userId: mockUserId,
        assetId: 'asset-xlm',
        amountStroops: 100_000_000,
        status: WithdrawalStatus.REQUIRES_REVALIDATION,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: true,
        projectedHealthFactor: 1.2,
        currentHealthFactor: 1.3,
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wd-123',
        status: WithdrawalStatus.DRAFT,
      });

      const result = await service.revalidateWithdrawal('wd-123', mockUserId);
      expect(result.status).toBe(WithdrawalStatus.DRAFT);
    });

    it('rejects revalidation when still insolvent', async () => {
      prisma.withdrawalRequest.findFirst.mockResolvedValue({
        id: 'wd-123',
        userId: mockUserId,
        assetId: 'asset-xlm',
        amountStroops: 100_000_000,
        status: WithdrawalStatus.REQUIRES_REVALIDATION,
      });
      solvencyService.assertWithdrawable.mockResolvedValue({
        allowed: false,
        errorKind: SolvencyErrorKind.INSUFFICIENT_COLLATERAL,
        projectedHealthFactor: 0.9,
        detail: 'Still insolvent',
      });

      await expect(
        service.revalidateWithdrawal('wd-123', mockUserId),
      ).rejects.toThrow(ConflictException);
    });
  });
});

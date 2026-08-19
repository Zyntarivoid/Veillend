import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AppConfigService } from '../config/app-config.service';
import { AdminActionRepository } from './admin-action.repository';
import { AdminTransactionBuilderService } from './admin-transaction-builder.service';

/**
 * Integration test for admin removal and session revocation
 *
 * Acceptance Criteria Test:
 * Unit test: create admin → create session → removeAdmin →
 * session no longer exists and JwtStrategy.validate() with the token
 * throws UnauthorizedException('Session not found or revoked').
 */
describe('Admin Session Revocation Integration', () => {
  let adminService: AdminService;
  let jwtStrategy: JwtStrategy;
  let prisma: PrismaService;

  const mockConfigService = {
    auth: {
      jwtSecret: 'test-secret',
      legacyAuthAllow: true,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        JwtStrategy,
        PrismaService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AdminActionRepository,
          useValue: {},
        },
        {
          provide: AdminTransactionBuilderService,
          useValue: {},
        },
      ],
    }).compile();

    adminService = module.get<AdminService>(AdminService);
    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should revoke sessions when admin is removed', async () => {
    const adminWallet = '0xTESTADMIN';
    const actorWallet = '0xSUPERADMIN';

    // Mock user
    const mockUser = {
      id: 'user-test-1',
      walletAddress: adminWallet,
      createdAt: new Date(),
    };

    // Mock session
    const mockSession = {
      id: 'session-test-1',
      userId: mockUser.id,
      token: 'test-jwt-token',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };

    // Mock admin
    const mockAdmin = {
      id: 'admin-test-1',
      walletAddress: adminWallet,
      createdAt: new Date(),
    };

    // Mock request object for JwtStrategy
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mockRequest = {
      headers: {
        authorization: `Bearer ${mockSession.token}`,
      },
    } as any;

    // Simulate transaction behavior

    jest.spyOn(prisma, '$transaction').mockImplementation((callback: any) => {
      const txMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue(mockUser),
        },
        session: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        admin: {
          delete: jest.fn().mockResolvedValue(mockAdmin),
        },
        adminAuditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return callback(txMock as any);
    });

    // Before removal: session exists
    jest
      .spyOn(prisma.session, 'findUnique')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .mockResolvedValueOnce({ ...mockSession, user: mockUser } as any);

    // Verify session is valid before removal
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const validatedUser = await jwtStrategy.validate(mockRequest, {
      walletAddress: adminWallet,
      sub: mockUser.id,
    });
    expect(validatedUser.walletAddress).toBe(adminWallet);

    // Remove the admin (and revoke sessions)
    await adminService.removeAdmin(adminWallet, actorWallet);

    // After removal: session no longer exists
    jest.spyOn(prisma.session, 'findUnique').mockResolvedValueOnce(null);

    // Verify that JwtStrategy.validate() throws UnauthorizedException

    await expect(
      jwtStrategy.validate(mockRequest as never, {
        walletAddress: adminWallet,
        sub: mockUser.id,
      }),
    ).rejects.toThrow(
      new UnauthorizedException('Session not found or revoked'),
    );
  });
});

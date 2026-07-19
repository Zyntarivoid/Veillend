import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let walletService: { verifySignature: jest.Mock };
  let jwtService: { sign: jest.Mock; decode: jest.Mock };
  let prisma: {
    user: { upsert: jest.Mock };
    session: { create: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    walletService = { verifySignature: jest.fn() };
    jwtService = { sign: jest.fn(), decode: jest.fn() };
    prisma = {
      user: { upsert: jest.fn() },
      session: { create: jest.fn(), delete: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: WalletService, useValue: walletService },
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('verifyWallet', () => {
    it('throws UnauthorizedException on an invalid signature', async () => {
      walletService.verifySignature.mockReturnValue(false);

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });

    it('upserts the user and creates a session on success', async () => {
      walletService.verifySignature.mockReturnValue(true);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      jwtService.sign.mockReturnValue('signed-token');
      const exp = Math.floor(Date.now() / 1000) + 604800;
      jwtService.decode.mockReturnValue({ exp });

      const result = await service.verifyWallet('GABC', 'nonce', 'sig');

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC' },
        create: { walletAddress: 'GABC' },
        update: {},
      });
      expect(prisma.session.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          token: 'signed-token',
          expiresAt: new Date(exp * 1000),
        },
      });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });
  });

  describe('revokeSession', () => {
    it('deletes the session', async () => {
      prisma.session.delete.mockResolvedValue({});

      await service.revokeSession('session-1');

      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
    });

    it('is idempotent when the session is already gone', async () => {
      prisma.session.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.revokeSession('session-1')).resolves.toBeUndefined();
    });

    it('rethrows unexpected errors', async () => {
      prisma.session.delete.mockRejectedValue(new Error('db down'));

      await expect(service.revokeSession('session-1')).rejects.toThrow(
        'db down',
      );
    });
  });
});

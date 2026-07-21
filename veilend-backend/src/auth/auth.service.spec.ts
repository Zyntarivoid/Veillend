import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, GoneException } from '@nestjs/common';
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
    session: {
      create: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    walletNonce: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    walletService = { verifySignature: jest.fn() };
    jwtService = { sign: jest.fn(), decode: jest.fn() };
    prisma = {
      user: { upsert: jest.fn() },
      session: {
        create: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      walletNonce: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
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

  describe('generateNonce', () => {
    it('persists a nonce with expiry and invalidates prior nonces', async () => {
      prisma.walletNonce.updateMany.mockResolvedValue({ count: 0 });
      prisma.walletNonce.create.mockResolvedValue({});

      const nonce = await service.generateNonce('GABC');

      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBe(64);
      expect(prisma.walletNonce.updateMany).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC', used: false },
        data: { used: true },
      });
      expect(prisma.walletNonce.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            walletAddress: 'GABC',
            nonce,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('verifyWallet', () => {
    it('throws UnauthorizedException when nonce is not found in DB', async () => {
      prisma.walletNonce.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on replay (nonce already used)', async () => {
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: true,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow('Nonce has already been used');
    });

    it('throws GoneException when nonce has expired', async () => {
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: false,
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.walletNonce.update.mockResolvedValue({});

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(GoneException);

      expect(prisma.walletNonce.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { used: true },
      });
    });

    it('throws UnauthorizedException on invalid signature', async () => {
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      walletService.verifySignature.mockReturnValue(false);

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });

    it('marks nonce used, upserts user, and creates session on success', async () => {
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      walletService.verifySignature.mockReturnValue(true);
      prisma.walletNonce.update.mockResolvedValue({});
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      jwtService.sign.mockReturnValue('signed-token');
      const exp = Math.floor(Date.now() / 1000) + 604800;
      jwtService.decode.mockReturnValue({ exp });
      prisma.session.create.mockResolvedValue({
        id: 'session-1',
        expiresAt: new Date(exp * 1000),
      });

      const result = await service.verifyWallet('GABC', 'nonce', 'sig');

      expect(prisma.walletNonce.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { used: true },
      });
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC' },
        create: { walletAddress: 'GABC' },
        update: {},
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        walletAddress: 'GABC',
        sub: 'user-1',
      });
      expect(result).toEqual({
        accessToken: 'signed-token',
        sessionId: 'session-1',
        expiresAt: new Date(exp * 1000).toISOString(),
      });
    });
  });

  describe('validateSession', () => {
    it('returns session info when session exists and is valid', async () => {
      const futureDate = new Date(Date.now() + 604800_000);
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        expiresAt: futureDate,
        user: { walletAddress: 'GABC' },
      });
      prisma.session.update.mockResolvedValue({});

      const result = await service.validateSession('some-token');

      expect(result).toEqual({
        sessionId: 'session-1',
        walletAddress: 'GABC',
        userId: 'user-1',
        expiresAt: futureDate,
      });
    });

    it('throws when session is not found (revoked)', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.validateSession('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
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

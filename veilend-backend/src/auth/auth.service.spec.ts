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
    withSerializable: jest.Mock;
    user: { upsert: jest.Mock; findUnique: jest.Mock };
    session: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    walletNonce: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    authAuditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    jtiRegistry: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    walletService = { verifySignature: jest.fn() };
    jwtService = { sign: jest.fn(), decode: jest.fn() };
    prisma = {
      // Passthrough: runs the callback with a proxy that delegates to `prisma`.
      withSerializable: jest.fn(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      ),
      user: { upsert: jest.fn(), findUnique: jest.fn() },
      session: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      walletNonce: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      authAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      jtiRegistry: {
        create: jest.fn(),
        deleteMany: jest.fn(),
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

    // Defaults so tests that don't care about token issuance details don't
    // have to stub every call individually.
    prisma.session.create.mockResolvedValue({ id: 'session-1' });
    prisma.session.update.mockResolvedValue({});
    prisma.jtiRegistry.create.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});
    jwtService.sign.mockReturnValue('signed-access-token');
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
      walletService.verifySignature.mockReturnValue(true);
      prisma.walletNonce.updateMany.mockResolvedValue({ count: 0 });
      prisma.walletNonce.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on replay (nonce already used)', async () => {
      walletService.verifySignature.mockReturnValue(true);
      prisma.walletNonce.updateMany.mockResolvedValue({ count: 0 });
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: true,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow('Authentication failed');
    });

    it('throws UnauthorizedException when nonce has expired', async () => {
      walletService.verifySignature.mockReturnValue(true);
      prisma.walletNonce.updateMany.mockResolvedValue({ count: 0 });
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: false,
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.walletNonce.update.mockResolvedValue({});

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.walletNonce.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { used: true },
      });
    });

    it('throws UnauthorizedException on invalid signature without burning the nonce', async () => {
      walletService.verifySignature.mockReturnValue(false);

      await expect(
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.walletNonce.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });

    it('mints exactly one session under concurrent identical verifications', async () => {
      walletService.verifySignature.mockReturnValue(true);
      // Simulate the DB: the first request claims the nonce, the second is too late.
      prisma.walletNonce.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.walletNonce.findFirst.mockResolvedValue({
        id: 'n-1',
        used: true,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.session.create.mockResolvedValue({ id: 'session-1' });

      const results = await Promise.allSettled([
        service.verifyWallet('GABC', 'nonce', 'sig'),
        service.verifyWallet('GABC', 'nonce', 'sig'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as Error).message).toBe(
        'Authentication failed',
      );
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
    });

    it('claims the nonce atomically, then upserts user, creates a session, and mints a token pair', async () => {
      walletService.verifySignature.mockReturnValue(true);
      prisma.walletNonce.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      prisma.session.create.mockResolvedValue({ id: 'session-1' });

      const result = await service.verifyWallet('GABC', 'nonce', 'sig');

      expect(prisma.walletNonce.updateMany).toHaveBeenCalledWith({
        where: {
          walletAddress: 'GABC',
          nonce: 'nonce',
          used: false,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: { used: true },
      });
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC' },
        create: { walletAddress: 'GABC' },
        update: {},
      });

      // Access token: 15-minute JWT carrying walletAddress/sub/jti/sid.
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: 'GABC',
          sub: 'user-1',
          sid: 'session-1',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          jti: expect.any(String),
        }),
        { expiresIn: 15 * 60 },
      );

      // A JtiRegistry row and a hashed RefreshToken row are written for the pair.
      expect(prisma.jtiRegistry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            userId: 'user-1',
            sessionId: 'session-1',
          }),
        }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            userId: 'user-1',
            sessionId: 'session-1',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            tokenHash: expect.any(String),
          }),
        }),
      );

      // The session row's token/expiresAt are updated to the real access token.
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ token: 'signed-access-token' }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'signed-access-token',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          refreshToken: expect.any(String),
          sessionId: 'session-1',
          user: { id: 'user-1', walletAddress: 'GABC' },
        }),
      );
      // Opaque refresh token: 64 bytes hex-encoded.
      expect((result as { refreshToken: string }).refreshToken).toHaveLength(
        128,
      );
    });
  });

  describe('refreshTokens', () => {
    const existingRow = {
      id: 'rt-1',
      userId: 'user-1',
      sessionId: 'session-1',
      tokenHash: 'irrelevant-because-lookup-is-mocked',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null as Date | null,
    };

    it('throws when the refresh token is unknown', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('deadbeef')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('throws when the refresh token has expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...existingRow,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshTokens('deadbeef')).rejects.toThrow(
        'Refresh token expired',
      );
    });

    it('rotates: revokes the old token and issues a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...existingRow });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        walletAddress: 'GABC',
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refreshTokens(
        'deadbeef',
        '127.0.0.1',
        'jest',
        'corr-1',
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.jtiRegistry.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ token: 'signed-access-token' }),
        }),
      );
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            walletAddress: 'GABC',
            event: 'TOKEN_REFRESH',
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'signed-access-token',
          sessionId: 'session-1',
        }),
      );
    });

    it('treats replay of an already-revoked token as family compromise and tears down every session', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...existingRow,
        revokedAt: new Date(),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        walletAddress: 'GABC',
      });
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });

      await expect(service.refreshTokens('deadbeef')).rejects.toThrow(
        'refresh_token_compromised_log_back_in',
      );

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            walletAddress: 'GABC',
            event: 'TOKEN_REFRESH_REUSE_DETECTED',
          }),
        }),
      );
      // A compromised family must not be issued a new pair.
      expect(prisma.jtiRegistry.create).not.toHaveBeenCalled();
    });

    it('treats a lost claim race (concurrent redemption) the same as a replay', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...existingRow });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        walletAddress: 'GABC',
      });
      // Someone else revoked it first between our read and our claim attempt.
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshTokens('deadbeef')).rejects.toThrow(
        'refresh_token_compromised_log_back_in',
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
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
    it('deletes the session (cascades to its refresh tokens / jtis)', async () => {
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

  describe('listSessions', () => {
    it('maps sessions and flags the current one', async () => {
      const now = new Date();
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'session-1',
          userAgent: 'chrome',
          ip: '1.2.3.4',
          createdAt: now,
          lastSeenAt: now,
        },
        {
          id: 'session-2',
          userAgent: 'mobile',
          ip: '5.6.7.8',
          createdAt: now,
          lastSeenAt: now,
        },
      ]);

      const result = await service.listSessions('user-1', 'session-2');

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toEqual([
        expect.objectContaining({ id: 'session-1', isCurrent: false }),
        expect.objectContaining({ id: 'session-2', isCurrent: true }),
      ]);
    });
  });

  describe('revokeSessionById', () => {
    it('deletes a session scoped to its owner and logs SESSION_REVOKED', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await service.revokeSessionById('session-1', 'user-1', 'GABC');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            walletAddress: 'GABC',
            event: 'SESSION_REVOKED',
          }),
        }),
      );
    });

    it('does nothing (no audit log) when the session does not belong to the caller', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await service.revokeSessionById('session-1', 'user-1', 'GABC');

      expect(prisma.authAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllSessions', () => {
    it('keeps the current session by default when keepCurrentSessionId is set', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.revokeAllSessions(
        'user-1',
        'GABC',
        'session-current',
      );

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 'session-current' } },
      });
      expect(result).toEqual({ revokedCount: 2 });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ event: 'SESSION_REVOKE_ALL' }),
        }),
      );
    });

    it('revokes every session including current when keepCurrentSessionId is undefined', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });

      await service.revokeAllSessions('user-1', 'GABC', undefined);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deletes expired jti and refresh token rows', async () => {
      prisma.jtiRegistry.deleteMany.mockResolvedValue({ count: 5 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.cleanupExpiredTokens();

      expect(prisma.jtiRegistry.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) as Date } },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) as Date } },
      });
      expect(result).toEqual({ jtiDeleted: 5, refreshTokensDeleted: 2 });
    });
  });
});

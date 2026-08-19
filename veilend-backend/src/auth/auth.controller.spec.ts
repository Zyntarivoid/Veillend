import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './types/authenticated-request.type';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    generateNonce: jest.Mock;
    revokeSession: jest.Mock;
    refreshTokens: jest.Mock;
    listSessions: jest.Mock;
    revokeSessionById: jest.Mock;
    revokeAllSessions: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      generateNonce: jest.fn().mockResolvedValue('mock-nonce'),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      refreshTokens: jest.fn(),
      listSessions: jest.fn(),
      revokeSessionById: jest.fn().mockResolvedValue(undefined),
      revokeAllSessions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: PrismaService,
          useValue: { admin: { findUnique: jest.fn() } },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('createNonce', () => {
    it('calls authService.generateNonce and returns the nonce', async () => {
      const result = await controller.createNonce(
        { walletAddress: 'GABC' },
        '127.0.0.1',
        'jest',
        '1234',
      );

      expect(authService.generateNonce).toHaveBeenCalledWith(
        'GABC',
        '127.0.0.1',
        'jest',
        '1234',
      );
      expect(result).toEqual({ nonce: 'mock-nonce' });
    });
  });

  describe('getSession', () => {
    it('maps req.user to the session response shape', () => {
      const expiresAt = new Date('2026-01-01T00:00:00.000Z');
      const req = {
        user: { walletAddress: 'GABC', sessionId: 'session-1', expiresAt },
      } as AuthenticatedRequest;

      expect(controller.getSession(req)).toEqual({
        walletAddress: 'GABC',
        sessionId: 'session-1',
        expiresAt: expiresAt.toISOString(),
      });
    });
  });

  describe('logout', () => {
    it('revokes the session and returns confirmation', async () => {
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      const result = await controller.logout(req, '127.0.0.1', 'jest', '1234');

      expect(authService.revokeSession).toHaveBeenCalledWith(
        'session-1',
        'GABC',
        '127.0.0.1',
        'jest',
        '1234',
      );
      expect(result).toEqual({ revoked: true });
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshTokens', async () => {
      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        sessionId: 'session-1',
      });

      const result = await controller.refresh(
        { refreshToken: 'raw-refresh' },
        '127.0.0.1',
        'jest',
        '1234',
      );

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'raw-refresh',
        '127.0.0.1',
        'jest',
        '1234',
      );
      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'new-access' }),
      );
    });
  });

  describe('listSessions', () => {
    it('lists sessions for the authenticated user', async () => {
      authService.listSessions.mockResolvedValue([
        { id: 'session-1', isCurrent: true },
      ]);
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          userId: 'user-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      const result = await controller.listSessions(req);

      expect(authService.listSessions).toHaveBeenCalledWith(
        'user-1',
        'session-1',
      );
      expect(result).toEqual({
        sessions: [{ id: 'session-1', isCurrent: true }],
      });
    });

    it('rejects when the request has no authenticated userId', async () => {
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      await expect(controller.listSessions(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeOneSession', () => {
    it('revokes the given session id for the authenticated user', async () => {
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          userId: 'user-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      const result = await controller.revokeOneSession(
        'session-2',
        req,
        '127.0.0.1',
        'jest',
        '1234',
      );

      expect(authService.revokeSessionById).toHaveBeenCalledWith(
        'session-2',
        'user-1',
        'GABC',
        '127.0.0.1',
        'jest',
        '1234',
      );
      expect(result).toEqual({ revoked: true });
    });
  });

  describe('revokeAllSessions', () => {
    it('keeps the current session by default', async () => {
      authService.revokeAllSessions.mockResolvedValue({ revokedCount: 2 });
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          userId: 'user-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      const result = await controller.revokeAllSessions(
        {},
        req,
        '127.0.0.1',
        'jest',
        '1234',
      );

      expect(authService.revokeAllSessions).toHaveBeenCalledWith(
        'user-1',
        'GABC',
        'session-1',
        '127.0.0.1',
        'jest',
        '1234',
      );
      expect(result).toEqual({ revokedCount: 2 });
    });

    it('revokes the current session too when keepCurrent is false', async () => {
      authService.revokeAllSessions.mockResolvedValue({ revokedCount: 3 });
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          userId: 'user-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      await controller.revokeAllSessions(
        { keepCurrent: false },
        req,
        '127.0.0.1',
        'jest',
        '1234',
      );

      expect(authService.revokeAllSessions).toHaveBeenCalledWith(
        'user-1',
        'GABC',
        undefined,
        '127.0.0.1',
        'jest',
        '1234',
      );
    });
  });
});

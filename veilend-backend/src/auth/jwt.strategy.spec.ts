import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: {
    session: { findUnique: jest.Mock };
    jtiRegistry: { findUnique: jest.Mock };
  };
  let configService: { auth: { jwtSecret: string; legacyAuthAllow: boolean } };

  beforeEach(async () => {
    prisma = {
      session: { findUnique: jest.fn() },
      jtiRegistry: { findUnique: jest.fn() },
    };
    configService = {
      auth: {
        jwtSecret: 'test',
        legacyAuthAllow: true,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: AppConfigService,
          useValue: {
            stellar: {
              sorobanRpcUrl: 'https://test',
              horizonUrl: 'https://test',
              network: 'testnet',
              networkPassphrase: 'Test SDF Network ; September 2015',
            },
            auth: configService.auth,
            indexer: {
              contractId:
                'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
              startLedger: 1,
              pollIntervalMs: 5000,
            },
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate — new-format token (jti + sid)', () => {
    it('returns session info when the jti is registered and unrevoked', async () => {
      const expiresAt = new Date(Date.now() + 900_000);
      prisma.jtiRegistry.findUnique.mockResolvedValue({
        jti: 'jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
        expiresAt,
        revokedAt: null,
      });
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        expiresAt,
      });

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      const result = await strategy.validate(req, {
        walletAddress: 'GABC',
        sub: 'user-1',
        jti: 'jti-1',
        sid: 'session-1',
      });

      expect(result).toEqual({
        walletAddress: 'GABC',
        sessionId: 'session-1',
        userId: 'user-1',
        expiresAt,
      });
      expect(prisma.jtiRegistry.findUnique).toHaveBeenCalledWith({
        where: { jti: 'jti-1' },
      });
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
      // The legacy raw-token lookup must not be consulted for new-format tokens.
      expect(prisma.session.findUnique).not.toHaveBeenCalledWith({
        where: { token: 'some-jwt-token' },
        include: { user: true },
      });
    });

    it('throws when the jti is not registered (unknown/never issued)', async () => {
      prisma.jtiRegistry.findUnique.mockResolvedValue(null);

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, {
          walletAddress: 'GABC',
          sub: 'user-1',
          jti: 'jti-1',
          sid: 'session-1',
        }),
      ).rejects.toThrow('Session not found or revoked');
    });

    it('throws when the jti has been revoked', async () => {
      prisma.jtiRegistry.findUnique.mockResolvedValue({
        jti: 'jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
        expiresAt: new Date(Date.now() + 900_000),
        revokedAt: new Date(),
      });

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, {
          walletAddress: 'GABC',
          sub: 'user-1',
          jti: 'jti-1',
          sid: 'session-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the jti has expired', async () => {
      prisma.jtiRegistry.findUnique.mockResolvedValue({
        jti: 'jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, {
          walletAddress: 'GABC',
          sub: 'user-1',
          jti: 'jti-1',
          sid: 'session-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the jti is valid but its session is gone', async () => {
      prisma.jtiRegistry.findUnique.mockResolvedValue({
        jti: 'jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
        expiresAt: new Date(Date.now() + 900_000),
        revokedAt: null,
      });
      prisma.session.findUnique.mockResolvedValue(null);

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, {
          walletAddress: 'GABC',
          sub: 'user-1',
          jti: 'jti-1',
          sid: 'session-1',
        }),
      ).rejects.toThrow('Session not found or revoked');
    });
  });

  describe('validate — legacy token (no jti/sid)', () => {
    it('falls back to raw-token session lookup when LEGACY_AUTH_ALLOW is true', async () => {
      const expiresAt = new Date(Date.now() + 604800_000);
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        user: { walletAddress: 'GABC' },
        expiresAt,
      });

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      const result = await strategy.validate(req, {
        walletAddress: 'GABC',
        sub: 'user-1',
      });

      expect(result).toEqual({
        walletAddress: 'GABC',
        sessionId: 'session-1',
        userId: 'user-1',
        expiresAt,
      });
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { token: 'some-jwt-token' },
        include: { user: true },
      });
    });

    it('throws UnauthorizedException when session is revoked', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      const req = {
        headers: { authorization: 'Bearer revoked-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, { walletAddress: 'GABC', sub: 'user-1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session has expired', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        user: { walletAddress: 'GABC' },
        expiresAt: new Date(Date.now() - 1000),
      });

      const req = {
        headers: { authorization: 'Bearer expired-token' },
      } as unknown as Request;

      await expect(
        strategy.validate(req, { walletAddress: 'GABC', sub: 'user-1' }),
      ).rejects.toThrow('Session has expired');
    });

    it('rejects legacy tokens outright when LEGACY_AUTH_ALLOW is false', async () => {
      configService.auth.legacyAuthAllow = false;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtStrategy,
          {
            provide: AppConfigService,
            useValue: {
              stellar: {
                sorobanRpcUrl: 'https://test',
                horizonUrl: 'https://test',
                network: 'testnet',
                networkPassphrase: 'Test SDF Network ; September 2015',
              },
              auth: { jwtSecret: 'test', legacyAuthAllow: false },
              indexer: {
                contractId:
                  'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
                startLedger: 1,
                pollIntervalMs: 5000,
              },
            },
          },
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      const strictStrategy = module.get<JwtStrategy>(JwtStrategy);

      const req = {
        headers: { authorization: 'Bearer some-jwt-token' },
      } as unknown as Request;

      await expect(
        strictStrategy.validate(req, { walletAddress: 'GABC', sub: 'user-1' }),
      ).rejects.toThrow('Legacy token format no longer accepted');
      expect(prisma.session.findUnique).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { session: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { session: { findUnique: jest.fn() } };

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
            auth: {
              jwtSecret: 'test',
            },
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

  describe('validate', () => {
    it('returns session info when session exists in DB', async () => {
      const expiresAt = new Date(Date.now() + 604800_000);
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
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
  });
});

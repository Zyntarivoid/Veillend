import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { session: { findUnique: jest.Mock } };

  function reqWithToken(token: string): Request {
    return { headers: { authorization: `Bearer ${token}` } } as Request;
  }

  beforeEach(async () => {
    prisma = { session: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('returns the authenticated user when an active session exists', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt,
    });

    const result = await strategy.validate(reqWithToken('abc'), {
      walletAddress: 'GABC',
    });

    expect(result).toEqual({
      walletAddress: 'GABC',
      sessionId: 'session-1',
      expiresAt,
    });
  });

  it('throws when no session exists for the token (revoked)', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate(reqWithToken('abc'), { walletAddress: 'GABC' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the session has expired', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      strategy.validate(reqWithToken('abc'), { walletAddress: 'GABC' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

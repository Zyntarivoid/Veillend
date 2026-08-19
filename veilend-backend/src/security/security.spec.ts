import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';

import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { AppConfigService } from '../config/app-config.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { createOriginCheckMiddleware } from '../middleware/origin-check';

const mockAppConfigService = {
  stellar: { network: 'testnet' },
};

// ── CORS origin-check middleware tests ────────────────────────────────────────

describe('createOriginCheckMiddleware', () => {
  const allowlist = ['http://localhost:3000', 'http://localhost:8081'];
  const middleware = createOriginCheckMiddleware(allowlist);

  it('blocks an unlisted origin with 403', () => {
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const req = {
      headers: { origin: 'http://evil.com' },
    } as unknown as Request;
    const res = { status: statusMock, json: jsonMock } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Forbidden: Origin not allowed',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes requests with no Origin header', () => {
    const req = { headers: {} } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('passes requests from an allowlisted origin', () => {
    const req = {
      headers: { origin: 'http://localhost:3000' },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('CORS origin-check via supertest', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AppConfigService, useValue: mockAppConfigService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(createOriginCheckMiddleware(['http://localhost:3000']));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 403 for requests from a non-allowlisted Origin', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .get('/')
      .set('Origin', 'http://attacker.example.com')
      .expect(403);
  });

  it('returns 200 for requests from an allowlisted Origin', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .get('/')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
  });
});

// ── Rate-limiter tests on AuthController ──────────────────────────────────────

describe('ThrottlerGuard — AuthController nonce endpoint', () => {
  let app: INestApplication;

  const mockAuthService = {
    generateNonce: jest.fn().mockReturnValue('mock-nonce-value'),
    verifyWallet: jest.fn().mockResolvedValue({ accessToken: 'jwt' }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            // Global limit is high; the @Throttle override on AuthController
            // caps nonce + verify at 15 per minute.
            ttl: 60000,
            limit: 200,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: PrismaService,
          useValue: { admin: { findUnique: jest.fn() } },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 429 on the 16th rapid request to POST /auth/nonce', async () => {
    // Send 15 requests — all should succeed (201 Created by default for POST)
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ walletAddress: 'GABC123' });
    }

    // 16th request must be throttled
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: 'GABC123' })
      .expect(429);
  });
});

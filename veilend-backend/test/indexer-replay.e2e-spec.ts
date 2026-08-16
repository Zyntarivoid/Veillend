/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { IndexerController } from '../src/indexer/indexer.controller';
import { IndexerService } from '../src/indexer/indexer.service';
import { IndexerRepository } from '../src/indexer/indexer.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AdminGuard } from '../src/auth/admin.guard';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

const VALID_ADMIN_WALLET =
  'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';
const VALID_NON_ADMIN_WALLET =
  'GDKIJJJXNFCZDUQMich2Wg4pJzLETOUWM3PA77WSZHO4KCLZU6YVK53P';

function createMockAdminGuard(allowedWallets: string[]) {
  return {
    canActivate: (context: any) => {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      if (!user || !user.walletAddress) {
        throw new UnauthorizedException('No user authenticated');
      }
      if (!allowedWallets.includes(user.walletAddress)) {
        throw new ForbiddenException('User is not an admin');
      }
      return true;
    },
  };
}

function createMockJwtGuard(walletAddress: string | null) {
  return {
    canActivate: (context: any) => {
      if (!walletAddress) {
        throw new UnauthorizedException();
      }
      const request = context.switchToHttp().getRequest();
      request.user = { walletAddress };
      return true;
    },
  };
}

describe('Indexer Replay (e2e)', () => {
  let app: INestApplication<App>;
  let mockIndexerService: {
    forceReplay: jest.Mock;
    getIsProcessing: jest.Mock;
  };

  async function createApp(jwtWallet: string | null, adminWallets: string[]) {
    mockIndexerService = {
      forceReplay: jest.fn().mockResolvedValue(undefined),
      getIsProcessing: jest.fn().mockReturnValue(false),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IndexerController],
      providers: [
        { provide: IndexerService, useValue: mockIndexerService },
        {
          provide: IndexerRepository,
          useValue: {
            getCheckpoint: jest
              .fn()
              .mockResolvedValue({ lastIndexedLedger: 0 }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, d: unknown) => d) },
        },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(createMockJwtGuard(jwtWallet))
      .overrideGuard(AdminGuard)
      .useValue(createMockAdminGuard(adminWallets))
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    return app;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Authentication', () => {
    it('rejects unauthenticated request with 401', async () => {
      await createApp(null, []);
      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=bad-only',
      );
      expect(res.status).toBe(401);
    });

    it('rejects authenticated non-admin with 403', async () => {
      await createApp(VALID_NON_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=bad-only',
      );
      expect(res.status).toBe(403);
    });

    it('allows admin to trigger a valid scoped replay', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=bad-only',
      );
      expect(res.status).toBe(200);
      expect((res.body as { message: string }).message).toContain('bad-only');
    });
  });

  describe('Indexer Processing Guard', () => {
    it('returns 409 when indexer is already processing', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      mockIndexerService.getIsProcessing.mockReturnValue(true);
      mockIndexerService.forceReplay.mockRejectedValue(
        new ConflictException('Indexer already running; replay not started'),
      );

      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=bad-only',
      );

      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toContain(
        'Indexer already running',
      );
    });
  });

  describe('Full-Wipe Protection', () => {
    it('returns 400 when scope=full without confirmation header', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=full',
      );
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'x-confirm-full-wipe',
      );
    });

    it('returns 200 when scope=full with x-confirm-full-wipe: yes', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('x-confirm-full-wipe', 'yes');
      expect(res.status).toBe(200);
      expect((res.body as { message: string }).message).toContain('full');
    });

    it('returns 400 when scope=full with wrong confirmation value', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('x-confirm-full-wipe', 'true');
      expect(res.status).toBe(400);
    });
  });

  describe('Scope Validation', () => {
    it('returns 400 for an invalid scope value', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      const res = await request(app.getHttpServer()).post(
        '/indexer/replay?scope=invalid',
      );
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'Invalid scope',
      );
    });
  });

  describe('Replay Scope Parameters', () => {
    it('passes scope=bad-only to service by default', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      await request(app.getHttpServer()).post('/indexer/replay');
      expect(mockIndexerService.forceReplay).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'bad-only' }),
      );
    });

    it('passes scope=full to service when explicitly requested', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      await request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('x-confirm-full-wipe', 'yes');
      expect(mockIndexerService.forceReplay).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'full', confirmFullWipe: true }),
      );
    });

    it('includes actor wallet in replay options', async () => {
      await createApp(VALID_ADMIN_WALLET, [VALID_ADMIN_WALLET]);
      await request(app.getHttpServer()).post('/indexer/replay');
      expect(mockIndexerService.forceReplay).toHaveBeenCalledWith(
        expect.objectContaining({ actorWallet: VALID_ADMIN_WALLET }),
      );
    });
  });
});

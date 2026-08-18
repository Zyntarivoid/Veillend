import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { HorizonService } from '../stellar/horizon.service';

// ── Typed response body ───────────────────────────────────────────────────────

interface HealthBody {
  status: string;
  components: {
    prisma: { status: string };
    sorobanRpc: { status: string };
    horizon: { status: string };
  };
}

// ── Minimal stubs ─────────────────────────────────────────────────────────────

const makePrismaStub = (up: boolean) => ({
  $queryRawUnsafe: up
    ? jest.fn().mockResolvedValue([{ '?column?': 1 }])
    : jest.fn().mockRejectedValue(new Error('Connection refused')),
});

const makeSorobanStub = (up: boolean, seq = 1234) => ({
  getLatestLedger: up
    ? jest.fn().mockResolvedValue({ sequence: seq })
    : jest.fn().mockRejectedValue(new Error('RPC down')),
});

const makeHorizonStub = (up: boolean, ledger = 5678) => ({
  getRoot: up
    ? jest.fn().mockResolvedValue({ core_latest_ledger: ledger })
    : jest.fn().mockRejectedValue(new Error('Horizon down')),
});

// ── Helper to spin up a lightweight NestJS app ────────────────────────────────

async function createApp(
  prismaUp: boolean,
  sorobanUp: boolean,
  horizonUp: boolean,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: 'PrismaService', useValue: makePrismaStub(prismaUp) },
      { provide: 'SorobanRpcService', useValue: makeSorobanStub(sorobanUp) },
      { provide: 'HorizonService', useValue: makeHorizonStub(horizonUp) },
    ],
  })
    .overrideProvider(HealthService)
    .useFactory({
      factory: (prisma: unknown, soroban: unknown, horizon: unknown) =>
        new HealthService(
          prisma as PrismaService,
          soroban as SorobanRpcService,
          horizon as HorizonService,
        ),
      inject: ['PrismaService', 'SorobanRpcService', 'HorizonService'],
    })
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  describe('GET /health — all components up', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(true, true, true);
    });

    afterAll(() => app.close());

    it('returns 200 with status ok', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as HealthBody;
      expect(body.status).toBe('ok');
      expect(body.components.prisma.status).toBe('up');
      expect(body.components.sorobanRpc.status).toBe('up');
      expect(body.components.horizon.status).toBe('up');
    });
  });

  describe('GET /health — Prisma DOWN, Soroban UP (degraded)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(false, true, true);
    });

    afterAll(() => app.close());

    it('returns 200 with status degraded', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as HealthBody;
      expect(body.status).toBe('degraded');
      expect(body.components.prisma.status).toBe('down');
      expect(body.components.sorobanRpc.status).toBe('up');
    });
  });

  describe('GET /health — all components DOWN', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(false, false, false);
    });

    afterAll(() => app.close());

    it('returns 503 when every probe fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.SERVICE_UNAVAILABLE);
      const body = res.body as HealthBody;
      expect(body.status).toBe('degraded');
    });
  });

  describe('GET /ready', () => {
    it('returns 200 when Prisma is up', async () => {
      const app = await createApp(true, false, false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer()).get('/ready').expect(200);
      await app.close();
    });

    it('returns 503 when Prisma is down', async () => {
      const app = await createApp(false, true, true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer())
        .get('/ready')
        .expect(HttpStatus.SERVICE_UNAVAILABLE);
      await app.close();
    });
  });
});

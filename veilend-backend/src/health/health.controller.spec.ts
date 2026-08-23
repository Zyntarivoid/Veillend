/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { HorizonService } from '../stellar/horizon.service';
import { IndexerService } from '../indexer/indexer.service';
import { ProtocolService } from '../protocol/protocol.service';

// ── Typed response body ───────────────────────────────────────────────────────

interface HealthBody {
  status: string;
  components: {
    prisma: { status: string };
    sorobanRpc: { status: string };
    horizon: { status: string };
    indexer: {
      status: string;
      lag: number;
      syncStatus: string;
      dedupCounter: number;
      lastError: string | null;
    };
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

const makeIndexerStub = (
  up: boolean,
  currentLedger = 1234,
  latestLedger = 1234,
) => ({
  getSyncStats: up
    ? jest.fn().mockResolvedValue({
        syncStatus: 'idle',
        currentLedger,
        lastIndexedLedger: currentLedger,
        latestLedger,
        lag: Math.max(0, latestLedger - currentLedger),
        percent: 100,
        eta: null,
        dedupCounter: 5,
        insertedCounter: 50,
        lastError: null,
        isProcessing: false,
        replay: { status: 'idle' },
      })
    : jest.fn().mockRejectedValue(new Error('Indexer failed')),
});

// ── Helper to spin up a lightweight NestJS app ────────────────────────────────

async function createApp(
  prismaUp: boolean,
  sorobanUp: boolean,
  horizonUp: boolean,
  indexerUp = true,
  indexerCurrentLedger = 1234,
  indexerLatestLedger = 1234,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: PrismaService, useValue: makePrismaStub(prismaUp) },
      { provide: SorobanRpcService, useValue: makeSorobanStub(sorobanUp) },
      { provide: HorizonService, useValue: makeHorizonStub(horizonUp) },
      {
        provide: ProtocolService,
        useValue: { getReachability: jest.fn().mockReturnValue('ok') },
      },
      {
        provide: IndexerService,
        useValue: makeIndexerStub(
          indexerUp,
          indexerCurrentLedger,
          indexerLatestLedger,
        ),
      },
    ],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  describe('GET /health — all components up', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(true, true, true, true, 1234, 1234);
    });

    afterAll(() => app.close());

    it('returns 200 with status ok', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as HealthBody;
      expect(body.status).toBe('ok');
      expect(body.components.prisma.status).toBe('up');
      expect(body.components.sorobanRpc.status).toBe('up');
      expect(body.components.horizon.status).toBe('up');
      expect(body.components.indexer.status).toBe('up');
      expect(body.components.indexer.lag).toBe(0);
    });
  });

  describe('GET /health — Prisma DOWN, Soroban UP (degraded)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(false, true, true, true);
    });

    afterAll(() => app.close());

    it('returns 200 with status degraded', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as HealthBody;
      expect(body.status).toBe('degraded');
      expect(body.components.prisma.status).toBe('down');
      expect(body.components.sorobanRpc.status).toBe('up');
    });
  });

  describe('GET /health — Indexer lag > 1000 ledgers (degraded)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // current ledger 100, latest ledger 1200 -> lag = 1100 > 1000
      app = await createApp(true, true, true, true, 100, 1200);
    });

    afterAll(() => app.close());

    it('returns 200 with status degraded when lag exceeds 1000 ledgers', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = res.body as HealthBody;
      expect(body.status).toBe('degraded');
      expect(body.components.indexer.status).toBe('degraded');
      expect(body.components.indexer.lag).toBe(1100);
      expect(body.components.indexer.dedupCounter).toBe(5);
    });
  });

  describe('GET /health — all components DOWN', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(false, false, false, false);
    });

    afterAll(() => app.close());

    it('returns 503 when every probe fails', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(HttpStatus.SERVICE_UNAVAILABLE);
      const body = res.body as HealthBody;
      expect(body.status).toBe('degraded');
    });
  });

  describe('GET /ready', () => {
    it('returns 200 when Prisma is up', async () => {
      const app = await createApp(true, false, false, false);
      await request(app.getHttpServer()).get('/ready').expect(200);
      await app.close();
    });

    it('returns 503 when Prisma is down', async () => {
      const app = await createApp(false, true, true, true);
      await request(app.getHttpServer())
        .get('/ready')
        .expect(HttpStatus.SERVICE_UNAVAILABLE);
      await app.close();
    });
  });
});

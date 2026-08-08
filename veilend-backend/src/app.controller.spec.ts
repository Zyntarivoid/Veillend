import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prisma: { $queryRaw: jest.Mock };

  const configMock = {
    stellar: {
      sorobanRpcUrl: 'https://test',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      network: 'testnet',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    auth: { jwtSecret: 'test' },
    indexer: {
      contractId: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
      startLedger: 1,
      pollIntervalMs: 5000,
    },
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AppConfigService, useValue: configMock },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('GET /health', () => {
    it('returns ok liveness payload', () => {
      const result = appController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.network).toBe('testnet');
      expect(typeof result.timestamp).toBe('number');
    });
  });

  describe('GET /ready', () => {
    it('returns ok when database is healthy', async () => {
      const res = { status: jest.fn() } as unknown as import('express').Response;
      const body = await appController.getReady(res);
      expect(body.status).toBe('ok');
      expect(body.checks.find((c) => c.name === 'database')?.status).toBe('ok');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('sets 503 when database is down', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      const res = { status: jest.fn() } as unknown as import('express').Response;
      const body = await appController.getReady(res);
      expect(body.status).toBe('error');
      expect(body.checks.find((c) => c.name === 'database')?.status).toBe('error');
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('GET /version', () => {
    it('returns version metadata', () => {
      const body = appController.getVersion();
      expect(body.name).toBe('veilend-backend');
      expect(body.network).toBe('testnet');
      expect(body.version).toBeTruthy();
    });
  });
});

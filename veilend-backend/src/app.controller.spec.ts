import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return a lightweight liveness response', () => {
      const health = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('veilend-backend');
      expect(health.uptimeSeconds).toEqual(expect.any(Number));
      expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('ready', () => {
    it('should report ready when runtime dependency configuration is valid', () => {
      const readiness = appService.getReadiness({
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
      });

      expect(readiness).toMatchObject({
        status: 'ready',
        dependencies: {
          horizon: { status: 'up' },
          sorobanRpc: { status: 'up' },
          networkPassphrase: { status: 'up' },
        },
      });
    });

    it('should expose dependency failures as not_ready', () => {
      const readiness = appService.getReadiness({
        STELLAR_HORIZON_URL: 'not-a-url',
        STELLAR_SOROBAN_RPC_URL: 'ftp://example.com',
        STELLAR_NETWORK_PASSPHRASE: ' ',
      });

      expect(readiness.status).toBe('not_ready');
      expect(readiness.dependencies.horizon.status).toBe('down');
      expect(readiness.dependencies.sorobanRpc.status).toBe('down');
      expect(readiness.dependencies.networkPassphrase.status).toBe('down');
    });

    it('should throw a 503 response when the controller sees not_ready', () => {
      jest.spyOn(appService, 'getReadiness').mockReturnValue({
        status: 'not_ready',
        timestamp: '2026-06-22T00:00:00.000Z',
        dependencies: {
          horizon: {
            status: 'down',
            reason: 'STELLAR_HORIZON_URL must be a valid URL',
          },
          sorobanRpc: { status: 'up' },
          networkPassphrase: { status: 'up' },
        },
      });

      expect(() => appController.getReadiness()).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('version', () => {
    it('should return version and commit metadata for deploy debugging', () => {
      const version = appService.getVersion({
        npm_package_version: '1.2.3',
        GIT_COMMIT: 'abc123',
        NODE_ENV: 'test',
      });

      expect(version).toEqual({
        service: 'veilend-backend',
        version: '1.2.3',
        commit: 'abc123',
        environment: 'test',
      });
    });
  });
});

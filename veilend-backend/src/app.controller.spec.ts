import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HorizonService } from './stellar/horizon.service';
import { SorobanRpcService } from './stellar/soroban-rpc.service';

describe('AppController', () => {
  let appController: AppController;
  let horizonService: jest.Mocked<
    Pick<HorizonService, 'isHealthy' | 'getLastError'>
  >;
  let sorobanRpcService: jest.Mocked<
    Pick<SorobanRpcService, 'isHealthy' | 'getLastError'>
  >;

  beforeEach(async () => {
    horizonService = {
      isHealthy: jest.fn().mockReturnValue(true),
      getLastError: jest.fn().mockReturnValue(null),
    };
    sorobanRpcService = {
      isHealthy: jest.fn().mockReturnValue(true),
      getLastError: jest.fn().mockReturnValue(null),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: HorizonService,
          useValue: horizonService,
        },
        {
          provide: SorobanRpcService,
          useValue: sorobanRpcService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('operational endpoints', () => {
    it('returns liveness health', () => {
      expect(appController.getHealth()).toEqual(
        expect.objectContaining({
          status: 'ok',
          service: 'veilend-backend',
        }),
      );
    });

    it('returns ready when dependencies are healthy', () => {
      const response = {
        status: jest.fn(),
      };

      expect(
        appController.getReadiness(response as unknown as Response),
      ).toEqual({
        status: 'ready',
        dependencies: {
          horizon: {
            status: 'ready',
            error: null,
          },
          sorobanRpc: {
            status: 'ready',
            error: null,
          },
        },
      });
      expect(response.status).not.toHaveBeenCalled();
    });

    it('returns not_ready and marks the response unavailable on dependency failure', () => {
      horizonService.isHealthy.mockReturnValue(false);
      horizonService.getLastError.mockReturnValue('horizon unavailable');
      const response = {
        status: jest.fn(),
      };

      expect(
        appController.getReadiness(response as unknown as Response),
      ).toEqual({
        status: 'not_ready',
        dependencies: {
          horizon: {
            status: 'unavailable',
            error: 'horizon unavailable',
          },
          sorobanRpc: {
            status: 'ready',
            error: null,
          },
        },
      });
      expect(response.status).toHaveBeenCalledWith(503);
    });

    it('returns version details', () => {
      const version = appController.getVersion();

      expect(version.service).toBe('veilend-backend');
      expect(typeof version.version).toBe('string');
      expect(typeof version.commit).toBe('string');
    });
  });
});

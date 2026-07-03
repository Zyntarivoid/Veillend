import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, ReadinessResponse } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: jest.Mocked<
    Pick<HealthService, 'getHealth' | 'getReadiness' | 'getVersion'>
  >;

  beforeEach(() => {
    healthService = {
      getHealth: jest.fn(),
      getReadiness: jest.fn(),
      getVersion: jest.fn(),
    };
    controller = new HealthController(
      healthService as unknown as HealthService,
    );
  });

  it('returns health response from the service', () => {
    const response = {
      status: 'ok' as const,
      service: 'veilend-backend',
      timestamp: '2026-07-03T00:00:00.000Z',
      uptimeSeconds: 10,
    };
    healthService.getHealth.mockReturnValue(response);

    expect(controller.getHealth()).toBe(response);
  });

  it('returns readiness response when dependencies are ready', async () => {
    const response: ReadinessResponse = {
      status: 'ready',
      service: 'veilend-backend',
      timestamp: '2026-07-03T00:00:00.000Z',
      dependencies: {
        sorobanRpc: {
          status: 'up',
          checkedAt: '2026-07-03T00:00:00.000Z',
        },
      },
    };
    healthService.getReadiness.mockResolvedValue(response);

    await expect(controller.getReadiness()).resolves.toBe(response);
  });

  it('throws 503 when readiness dependencies are not ready', async () => {
    const response: ReadinessResponse = {
      status: 'not_ready',
      service: 'veilend-backend',
      timestamp: '2026-07-03T00:00:00.000Z',
      dependencies: {
        sorobanRpc: {
          status: 'down',
          checkedAt: '2026-07-03T00:00:00.000Z',
          message: 'RPC unavailable',
        },
      },
    };
    healthService.getReadiness.mockResolvedValue(response);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns version response from the service', () => {
    const response = {
      service: 'veilend-backend',
      version: '0.0.1',
      commit: 'abc123',
      ref: 'main',
      environment: 'test',
    };
    healthService.getVersion.mockReturnValue(response);

    expect(controller.getVersion()).toBe(response);
  });
});

import { HealthService } from './health.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';

describe('HealthService', () => {
  const originalEnv = process.env;
  let sorobanRpcService: jest.Mocked<
    Pick<SorobanRpcService, 'validateConnection' | 'getLastError'>
  >;
  let service: HealthService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    sorobanRpcService = {
      validateConnection: jest.fn(),
      getLastError: jest.fn(),
    };
    service = new HealthService(
      sorobanRpcService as unknown as SorobanRpcService,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('returns lightweight liveness status', () => {
    const health = service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.service).toBe('veilend-backend');
    expect(health.timestamp).toEqual(expect.any(String));
    expect(health.uptimeSeconds).toEqual(expect.any(Number));
  });

  it('returns ready when Soroban RPC validates successfully', async () => {
    sorobanRpcService.validateConnection.mockResolvedValue(true);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('ready');
    expect(readiness.dependencies.sorobanRpc.status).toBe('up');
    expect(readiness.dependencies.sorobanRpc.checkedAt).toEqual(
      expect.any(String),
    );
  });

  it('returns not_ready and dependency message when Soroban RPC is unhealthy', async () => {
    sorobanRpcService.validateConnection.mockResolvedValue(false);
    sorobanRpcService.getLastError.mockReturnValue('RPC unavailable');

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.dependencies.sorobanRpc).toMatchObject({
      status: 'down',
      message: 'RPC unavailable',
    });
  });

  it('returns not_ready when the dependency check throws', async () => {
    sorobanRpcService.validateConnection.mockRejectedValue(
      new Error('network failure'),
    );

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.dependencies.sorobanRpc).toMatchObject({
      status: 'down',
      message: 'network failure',
    });
  });

  it('returns package and deployment version metadata', () => {
    process.env.GIT_SHA = 'abc123';
    process.env.GIT_REF = 'main';
    process.env.NODE_ENV = 'test';

    service = new HealthService(
      sorobanRpcService as unknown as SorobanRpcService,
    );
    const version = service.getVersion();

    expect(version).toMatchObject({
      service: 'veilend-backend',
      commit: 'abc123',
      ref: 'main',
      environment: 'test',
    });
    expect(version.version).toEqual(expect.any(String));
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { SorobanRpcService } from './soroban-rpc.service';
import { rpc } from '@stellar/stellar-sdk';
import { ClsService } from 'nestjs-cls';

// Mock the rpc namespace and Server constructor
jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getHealth: jest.fn(),
      })),
    },
  };
});

describe('SorobanRpcService', () => {
  let service: SorobanRpcService;
  let mockRpcServerInstance: {
    getHealth: jest.Mock;
  };
  let clsMock: { isActive: jest.Mock; getId: jest.Mock };

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    clsMock = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('test-correlation-id-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanRpcService,
        {
          provide: AppConfigService,
          useValue: {
            stellar: {
              sorobanRpcUrl: 'https://test',
              horizonUrl: 'https://test',
              network: 'testnet',
              networkPassphrase: 'Test SDF Network ; September 2015',
            },
            auth: {
              jwtSecret: 'test',
            },
            indexer: {
              contractId:
                'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
              startLedger: 1,
              pollIntervalMs: 5000,
            },
          },
        },
        {
          provide: ClsService,
          useValue: clsMock,
        },
      ],
    }).compile();

    service = module.get<SorobanRpcService>(SorobanRpcService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Soroban RPC client', () => {
      service.onModuleInit();
      expect(rpc.Server).toHaveBeenCalledWith('https://test');
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      service.onModuleInit();
      const serverMock = rpc.Server as unknown as jest.Mock;
      mockRpcServerInstance = serverMock.mock.results[0].value as {
        getHealth: jest.Mock;
      };
    });

    it('should set healthy to true when getHealth returns status healthy', async () => {
      mockRpcServerInstance.getHealth.mockResolvedValueOnce({
        status: 'healthy',
      });

      const result = await service.validateConnection();

      expect(result).toBe(true);
      expect(service.isHealthy()).toBe(true);
      expect(service.getLastError()).toBeNull();
    });

    it('should set healthy to false when getHealth returns unhealthy status', async () => {
      mockRpcServerInstance.getHealth.mockResolvedValueOnce({
        status: 'unhealthy',
      });

      const result = await service.validateConnection();

      expect(result).toBe(false);
      expect(service.isHealthy()).toBe(false);
      expect(service.getLastError()).toBe('Reported status: unhealthy');
    });

    it('should set healthy to false when getHealth throws an error', async () => {
      mockRpcServerInstance.getHealth.mockRejectedValueOnce(
        new Error('RPC Offline'),
      );

      const result = await service.validateConnection();

      expect(result).toBe(false);
      expect(service.isHealthy()).toBe(false);
      expect(service.getLastError()).toBe('RPC Offline');
    });
  });

  describe('checkConnection$', () => {
    beforeEach(() => {
      service.onModuleInit();
      const serverMock = rpc.Server as unknown as jest.Mock;
      mockRpcServerInstance = serverMock.mock.results[0].value as {
        getHealth: jest.Mock;
      };
    });

    it('should emit success response when connection succeeds', (done) => {
      mockRpcServerInstance.getHealth.mockResolvedValueOnce({
        status: 'healthy',
      });

      service.checkConnection$().subscribe((response) => {
        expect(response.success).toBe(true);
        expect(response.data?.connected).toBe(true);
        done();
      });
    });

    it('should emit error response when connection fails', (done) => {
      mockRpcServerInstance.getHealth.mockRejectedValueOnce(
        new Error('RPC Offline'),
      );

      service.checkConnection$().subscribe((response) => {
        expect(response.success).toBe(false);
        expect(response.data?.connected).toBe(false);
        expect(response.error?.message).toBe('RPC Offline');
        done();
      });
    });
  });

  describe('getOutboundFetchOptions', () => {
    it('should include X-Correlation-Id header matching current CLS id', () => {
      const options = service.getOutboundFetchOptions();
      const headers = options.headers as Record<string, string>;

      expect(headers['x-correlation-id']).toBe('test-correlation-id-123');
    });

    it('should omit X-Correlation-Id when no active CLS context', () => {
      clsMock.isActive.mockReturnValue(false);

      const options = service.getOutboundFetchOptions();
      const headers = options.headers as Record<string, string>;

      expect(headers['x-correlation-id']).toBeUndefined();
    });

    it('should always include Content-Type header', () => {
      const options = service.getOutboundFetchOptions();
      const headers = options.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});

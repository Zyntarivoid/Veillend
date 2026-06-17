/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SorobanRpcService } from './soroban-rpc.service';
import { rpc } from '@stellar/stellar-sdk';

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
  let configService: ConfigService;
  let mockRpcServerInstance: {
    getHealth: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanRpcService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue('https://soroban-testnet.stellar.org'),
          },
        },
      ],
    }).compile();

    service = module.get<SorobanRpcService>(SorobanRpcService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Soroban RPC client and trigger connection check', () => {
      service.onModuleInit();
      const getSpy = configService.get as jest.Mock;
      expect(getSpy).toHaveBeenCalledWith(
        'stellar.sorobanRpcUrl',
        'https://soroban-testnet.stellar.org',
      );
      expect(rpc.Server).toHaveBeenCalledWith(
        'https://soroban-testnet.stellar.org',
      );
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
});

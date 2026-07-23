/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { HorizonService } from './horizon.service';
import { Horizon } from '@stellar/stellar-sdk';

// Mock the Horizon class and its Server constructor
jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        root: jest.fn(),
      })),
    },
  };
});

describe('HorizonService', () => {
  let service: HorizonService;
  let mockHorizonServerInstance: {
    root: jest.Mock;
  };

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonService,
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
      ],
    }).compile();

    service = module.get<HorizonService>(HorizonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Horizon client', () => {
      service.onModuleInit();
      expect(Horizon.Server).toHaveBeenCalledWith('https://test');
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      service.onModuleInit();
      const serverMock = Horizon.Server as unknown as jest.Mock;
      mockHorizonServerInstance = serverMock.mock.results[0].value as {
        root: jest.Mock;
      };
    });

    it('should set healthy to true when root succeeds', async () => {
      mockHorizonServerInstance.root.mockResolvedValueOnce({});

      const result = await service.validateConnection();

      expect(result).toBe(true);
      expect(service.isHealthy()).toBe(true);
      expect(service.getLastError()).toBeNull();
    });

    it('should set healthy to false and capture error message when root throws', async () => {
      mockHorizonServerInstance.root.mockRejectedValueOnce(
        new Error('Network offline'),
      );

      const result = await service.validateConnection();

      expect(result).toBe(false);
      expect(service.isHealthy()).toBe(false);
      expect(service.getLastError()).toBe('Network offline');
    });
  });

  describe('checkConnection$', () => {
    beforeEach(() => {
      service.onModuleInit();
      const serverMock = Horizon.Server as unknown as jest.Mock;
      mockHorizonServerInstance = serverMock.mock.results[0].value as {
        root: jest.Mock;
      };
    });

    it('should emit success response when connection succeeds', (done) => {
      mockHorizonServerInstance.root.mockResolvedValueOnce({});

      service.checkConnection$().subscribe((response) => {
        expect(response.success).toBe(true);
        expect(response.data?.connected).toBe(true);
        done();
      });
    });

    it('should emit error response when connection fails', (done) => {
      mockHorizonServerInstance.root.mockRejectedValueOnce(
        new Error('Horizon offline'),
      );

      service.checkConnection$().subscribe((response) => {
        expect(response.success).toBe(false);
        expect(response.data?.connected).toBe(false);
        expect(response.error?.message).toBe('Horizon offline');
        done();
      });
    });
  });
});

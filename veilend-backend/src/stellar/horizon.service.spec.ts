/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
  let configService: ConfigService;
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
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue('https://horizon-testnet.stellar.org'),
          },
        },
      ],
    }).compile();

    service = module.get<HorizonService>(HorizonService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Horizon client and trigger connection check', () => {
      service.onModuleInit();
      const getSpy = configService.get as jest.Mock;
      expect(getSpy).toHaveBeenCalledWith(
        'stellar.horizonUrl',
        'https://horizon-testnet.stellar.org',
      );
      expect(Horizon.Server).toHaveBeenCalledWith(
        'https://horizon-testnet.stellar.org',
      );
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
        expect(response.error).toBeUndefined();
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

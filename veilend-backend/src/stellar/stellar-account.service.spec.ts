import { Test, TestingModule } from '@nestjs/testing';
import { StellarAccountService } from './stellar-account.service';
import { HorizonService } from './horizon.service';
import { SorobanRpcService } from './soroban-rpc.service';
import { Horizon, Account } from '@stellar/stellar-sdk';

describe('StellarAccountService', () => {
  let service: StellarAccountService;

  const mockHorizonClient = {
    loadAccount: jest.fn(),
  };

  const mockSorobanClient = {
    getAccount: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarAccountService,
        {
          provide: HorizonService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockHorizonClient),
          },
        },
        {
          provide: SorobanRpcService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSorobanClient),
          },
        },
      ],
    }).compile();

    service = module.get<StellarAccountService>(StellarAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lookupAccountHorizon', () => {
    it('should return success response with account data when Horizon loads successfully', async () => {
      const mockAccountData = {
        id: 'GABC...',
      } as unknown as Horizon.AccountResponse;
      mockHorizonClient.loadAccount.mockResolvedValueOnce(mockAccountData);

      const response = await service.lookupAccountHorizon('GABC...');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockAccountData);
      expect(response.error).toBeUndefined();
      expect(mockHorizonClient.loadAccount).toHaveBeenCalledWith('GABC...');
    });

    it('should return safe error response when Horizon throws an error', async () => {
      const mockError = {
        message: 'Account not found',
        response: { status: 404 },
      };
      mockHorizonClient.loadAccount.mockRejectedValueOnce(mockError);

      const response = await service.lookupAccountHorizon('GABC...');

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error?.message).toBe('Account not found');
      expect(response.error?.code).toBe('404');
      expect(response.error?.rawError).toEqual(mockError);
    });
  });

  describe('lookupAccountSoroban', () => {
    it('should return success response when Soroban RPC getAccount succeeds', async () => {
      const mockAccountData = {
        id: 'GABC...',
        sequence: '123',
      } as unknown as Account;
      mockSorobanClient.getAccount.mockResolvedValueOnce(mockAccountData);

      const response = await service.lookupAccountSoroban('GABC...');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockAccountData);
      expect(response.error).toBeUndefined();
    });

    it('should return safe error response when Soroban RPC throws an error', async () => {
      const mockError = new Error('Soroban RPC down');
      mockSorobanClient.getAccount.mockRejectedValueOnce(mockError);

      const response = await service.lookupAccountSoroban('GABC...');

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error?.message).toBe('Soroban RPC down');
      expect(response.error?.code).toBe('SOROBAN_RPC_ERROR');
    });
  });

  describe('lookupAccount (unified)', () => {
    it('should return Horizon account if Horizon lookup succeeds', async () => {
      const mockHorizonAccount = {
        id: 'GABC...',
        sequence: '1',
      } as unknown as Horizon.AccountResponse;
      mockHorizonClient.loadAccount.mockResolvedValueOnce(mockHorizonAccount);

      const response = await service.lookupAccount('GABC...');

      expect(response.success).toBe(true);
      expect(response.data?.horizon).toEqual(mockHorizonAccount);
      expect(response.data?.soroban).toBeUndefined();
      expect(mockSorobanClient.getAccount).not.toHaveBeenCalled();
    });

    it('should fallback to Soroban lookup if Horizon fails and Soroban succeeds', async () => {
      mockHorizonClient.loadAccount.mockRejectedValueOnce(
        new Error('Horizon offline'),
      );
      const mockSorobanAccount = {
        id: 'GABC...',
        sequence: '1',
      } as unknown as Account;
      mockSorobanClient.getAccount.mockResolvedValueOnce(mockSorobanAccount);

      const response = await service.lookupAccount('GABC...');

      expect(response.success).toBe(true);
      expect(response.data?.soroban).toEqual(mockSorobanAccount);
      expect(response.data?.horizon).toBeUndefined();
    });

    it('should return safe error response if both lookups fail', async () => {
      mockHorizonClient.loadAccount.mockRejectedValueOnce(
        new Error('Horizon offline'),
      );
      mockSorobanClient.getAccount.mockRejectedValueOnce(
        new Error('Soroban offline'),
      );

      const response = await service.lookupAccount('GABC...');

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error?.code).toBe('ACCOUNT_NOT_FOUND');
      expect(response.error?.message).toContain('could not be found');
    });
  });

  describe('observable lookups', () => {
    it('should emit success response in lookupAccountHorizon$', (done) => {
      const mockHorizonAccount = {
        id: 'GABC...',
      } as unknown as Horizon.AccountResponse;
      mockHorizonClient.loadAccount.mockResolvedValueOnce(mockHorizonAccount);

      service.lookupAccountHorizon$('GABC...').subscribe((response) => {
        expect(response.success).toBe(true);
        expect(response.data).toEqual(mockHorizonAccount);
        done();
      });
    });

    it('should emit failure response in lookupAccountHorizon$ on error', (done) => {
      mockHorizonClient.loadAccount.mockRejectedValueOnce(
        new Error('Horizon error'),
      );

      service.lookupAccountHorizon$('GABC...').subscribe((response) => {
        expect(response.success).toBe(false);
        expect(response.error?.message).toBe('Horizon error');
        done();
      });
    });
  });
});

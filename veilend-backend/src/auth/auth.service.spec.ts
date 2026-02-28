import { AuthService } from './auth.service';

jest.mock('starknet', () => ({
  typedData: { getMessageHash: jest.fn() },
  ec: { starkCurve: { verify: jest.fn(), Signature: jest.fn() } },
}));

const { typedData, ec } = require('starknet');

describe('AuthService', () => {
  let authService: AuthService;
  const mockUsersService: any = {
    findOne: jest.fn(),
    createOrUpdate: jest.fn(),
  };
  const mockJwtService: any = { sign: jest.fn().mockReturnValue('signed_token') };
  const mockConfigService: any = { get: jest.fn().mockReturnValue(undefined) };

  beforeEach(() => {
    jest.resetAllMocks();
    authService = new AuthService(mockUsersService, mockJwtService, mockConfigService);
  });

  it('generateNonce should create and persist a nonce', async () => {
    mockUsersService.createOrUpdate.mockResolvedValue({ address: '0xabc', nonce: '123' });
    const nonce = await authService.generateNonce('0xabc');
    expect(typeof nonce).toBe('string');
    expect(mockUsersService.createOrUpdate).toHaveBeenCalledWith('0xabc', expect.objectContaining({ nonce }));
  });

  it('verifySignature succeeds with valid signature and clears nonce', async () => {
    const now = Date.now();
    mockUsersService.findOne.mockResolvedValue({ address: '0xabc', nonce: '999', nonce_expires_at: now + 10000 });

    // Mock typedData.getMessageHash and ec.starkCurve.verify
    (typedData.getMessageHash as jest.Mock).mockReturnValue(BigInt(123));
    (ec.starkCurve.verify as jest.Mock).mockReturnValue(true);

    const user = await authService.verifySignature('0xabc', ['1', '2'], { message: { nonce: '999' } }, '0xpub');
    expect(user).toBeDefined();
    expect(mockUsersService.createOrUpdate).toHaveBeenCalledWith('0xabc', { nonce: null, nonce_expires_at: null });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

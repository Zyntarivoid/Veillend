import { Test, TestingModule } from '@nestjs/testing';
import { TokenCleanupService } from './token-cleanup.service';
import { AuthService } from './auth.service';

describe('TokenCleanupService', () => {
  let service: TokenCleanupService;
  let authService: { cleanupExpiredTokens: jest.Mock };

  beforeEach(async () => {
    authService = { cleanupExpiredTokens: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupService,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get(TokenCleanupService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('run', () => {
    it('delegates to authService.cleanupExpiredTokens', async () => {
      authService.cleanupExpiredTokens.mockResolvedValue({
        jtiDeleted: 3,
        refreshTokensDeleted: 1,
      });

      await service.run();

      expect(authService.cleanupExpiredTokens).toHaveBeenCalled();
    });

    it('does not throw when cleanup fails', async () => {
      authService.cleanupExpiredTokens.mockRejectedValue(new Error('db down'));

      await expect(service.run()).resolves.toBeUndefined();
    });
  });

  describe('onApplicationBootstrap / onModuleDestroy', () => {
    it('schedules a timer that can be torn down cleanly', () => {
      service.onApplicationBootstrap();
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});

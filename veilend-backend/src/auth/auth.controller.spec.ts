import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './types/authenticated-request.type';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { revokeSession: jest.Mock };

  beforeEach(async () => {
    authService = { revokeSession: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('getSession', () => {
    it('maps req.user to the session response shape', () => {
      const expiresAt = new Date('2026-01-01T00:00:00.000Z');
      const req = {
        user: { walletAddress: 'GABC', sessionId: 'session-1', expiresAt },
      } as AuthenticatedRequest;

      expect(controller.getSession(req)).toEqual({
        walletAddress: 'GABC',
        sessionId: 'session-1',
        expiresAt: expiresAt.toISOString(),
      });
    });
  });

  describe('logout', () => {
    it('revokes the session and returns confirmation', async () => {
      const req = {
        user: {
          walletAddress: 'GABC',
          sessionId: 'session-1',
          expiresAt: new Date(),
        },
      } as AuthenticatedRequest;

      const result = await controller.logout(req);

      expect(authService.revokeSession).toHaveBeenCalledWith('session-1');
      expect(result).toEqual({ revoked: true });
    });
  });
});

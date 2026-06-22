import { BadRequestException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(() => {
    service = new ProfilesService();
  });

  it('returns a default profile for a new wallet', () => {
    expect(service.getProfile('GWALLET123')).toEqual({
      walletAddress: 'GWALLET123',
      username: null,
      displayName: null,
      privacy: {
        hideBalances: false,
        hideActivity: false,
        requirePrivacyMode: false,
      },
      updatedAt: null,
    });
  });

  it('updates username, display name, and privacy preferences', () => {
    const updated = service.updateProfile('GWALLET123', {
      username: 'veillender',
      displayName: 'Veil Lender',
      privacy: {
        hideBalances: true,
      },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        walletAddress: 'GWALLET123',
        username: 'veillender',
        displayName: 'Veil Lender',
        privacy: {
          hideBalances: true,
          hideActivity: false,
          requirePrivacyMode: false,
        },
      }),
    );
    expect(typeof updated.updatedAt).toBe('string');
    expect(service.getProfile('GWALLET123').privacy.hideBalances).toBe(true);
  });

  it('rejects malformed wallet identifiers', () => {
    expect(() => service.getProfile('bad')).toThrow(BadRequestException);
  });
});

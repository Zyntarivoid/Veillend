import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(() => {
    service = new ProfilesService();
  });

  it('returns a default profile with privacy preferences for a new wallet', () => {
    const profile = service.getProfile('G'.padEnd(56, 'A'));

    expect(profile).toEqual({
      walletAddress: 'G'.padEnd(56, 'A'),
      username: null,
      displayName: null,
      bio: null,
      settings: {
        locale: 'en-US',
        theme: 'system',
        emailNotifications: false,
      },
      privacy: {
        showPortfolioValue: false,
        showTransactionHistory: false,
        allowAnalytics: false,
      },
      updatedAt: expect.any(String),
    });
  });

  it('updates username, profile settings, and privacy preferences without dropping defaults', () => {
    const walletAddress = 'G'.padEnd(56, 'B');
    const updated = service.updateProfile(walletAddress, {
      username: 'stellar_builder',
      displayName: 'Stellar Builder',
      settings: {
        theme: 'dark',
        emailNotifications: true,
      },
      privacy: {
        showPortfolioValue: true,
      },
    });

    expect(updated).toMatchObject({
      walletAddress,
      username: 'stellar_builder',
      displayName: 'Stellar Builder',
      settings: {
        locale: 'en-US',
        theme: 'dark',
        emailNotifications: true,
      },
      privacy: {
        showPortfolioValue: true,
        showTransactionHistory: false,
        allowAnalytics: false,
      },
    });
    expect(service.getProfile(walletAddress)).toEqual(updated);
  });
});

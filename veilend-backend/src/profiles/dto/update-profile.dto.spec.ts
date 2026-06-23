import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

async function validationErrors(payload: Record<string, unknown>) {
  return validate(plainToInstance(UpdateProfileDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('UpdateProfileDto', () => {
  it('accepts documented username, settings, and privacy fields', async () => {
    await expect(
      validationErrors({
        username: 'stellar_builder',
        displayName: 'Stellar Builder',
        bio: 'Building private Stellar lending tools.',
        settings: {
          locale: 'en-GB',
          theme: 'dark',
          emailNotifications: true,
        },
        privacy: {
          showPortfolioValue: true,
          showTransactionHistory: false,
          allowAnalytics: true,
        },
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects malformed usernames, settings, privacy preferences, and unknown fields', async () => {
    const errors = await validationErrors({
      username: 'bad username!',
      settings: {
        theme: 'neon',
        emailNotifications: 'yes',
      },
      privacy: {
        showPortfolioValue: 'public',
      },
      admin: true,
    });

    const serialized = JSON.stringify(errors);
    expect(serialized).toContain('username');
    expect(serialized).toContain('settings');
    expect(serialized).toContain('privacy');
    expect(serialized).toContain('admin');
  });
});

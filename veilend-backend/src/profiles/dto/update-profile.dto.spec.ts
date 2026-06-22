import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('accepts valid profile updates', () => {
    const dto = plainToInstance(UpdateProfileDto, {
      username: 'veil_lender-1',
      displayName: 'Veil Lender',
      privacy: {
        hideBalances: true,
        hideActivity: false,
        requirePrivacyMode: true,
      },
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects malformed profile updates', () => {
    const dto = plainToInstance(UpdateProfileDto, {
      username: 'x',
      displayName: 'a'.repeat(81),
      privacy: {
        hideBalances: 'yes',
      },
      unexpected: true,
    });

    const errors = validateSync(dto, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'username',
        'displayName',
        'privacy',
        'unexpected',
      ]),
    );
  });
});

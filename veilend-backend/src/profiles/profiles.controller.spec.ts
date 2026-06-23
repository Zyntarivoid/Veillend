import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [ProfilesService],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it('documents read and update endpoints through stable controller methods', () => {
    const walletAddress = 'G'.padEnd(56, 'C');

    expect(controller.readProfile(walletAddress).walletAddress).toBe(
      walletAddress,
    );
    expect(
      controller.updateProfile(walletAddress, {
        username: 'profile_user',
        privacy: { showTransactionHistory: true },
      }),
    ).toMatchObject({
      walletAddress,
      username: 'profile_user',
      privacy: {
        showPortfolioValue: false,
        showTransactionHistory: true,
        allowAnalytics: false,
      },
    });
  });
});

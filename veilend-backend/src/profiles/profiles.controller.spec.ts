import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: jest.Mocked<
    Pick<ProfilesService, 'getProfile' | 'updateProfile'>
  >;

  beforeEach(() => {
    service = {
      getProfile: jest.fn().mockReturnValue({ walletAddress: 'GWALLET123' }),
      updateProfile: jest.fn().mockReturnValue({
        walletAddress: 'GWALLET123',
        username: 'veillender',
      }),
    };

    controller = new ProfilesController(service as ProfilesService);
  });

  it('reads a profile by wallet address', () => {
    expect(controller.getProfile('GWALLET123')).toEqual({
      walletAddress: 'GWALLET123',
    });
    expect(service.getProfile).toHaveBeenCalledWith('GWALLET123');
  });

  it('updates a profile by wallet address', () => {
    expect(
      controller.updateProfile('GWALLET123', {
        username: 'veillender',
      }),
    ).toEqual({
      walletAddress: 'GWALLET123',
      username: 'veillender',
    });
    expect(service.updateProfile).toHaveBeenCalledWith('GWALLET123', {
      username: 'veillender',
    });
  });
});

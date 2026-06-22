import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

describe('AssetsController', () => {
  let controller: AssetsController;
  let service: jest.Mocked<
    Pick<AssetsService, 'getSupportedAssets' | 'getAssetBySymbol'>
  >;

  beforeEach(() => {
    service = {
      getSupportedAssets: jest.fn().mockReturnValue({ assets: [], cache: {} }),
      getAssetBySymbol: jest.fn().mockReturnValue({ symbol: 'XLM' }),
    };

    controller = new AssetsController(service);
  });

  it('returns supported assets from the service', () => {
    expect(controller.getSupportedAssets()).toEqual({ assets: [], cache: {} });
    expect(service.getSupportedAssets).toHaveBeenCalledTimes(1);
  });

  it('returns a requested asset by symbol', () => {
    expect(controller.getAssetBySymbol('xlm')).toEqual({ symbol: 'XLM' });
    expect(service.getAssetBySymbol).toHaveBeenCalledWith('xlm');
  });
});

import { Controller, Get, Header, Param } from '@nestjs/common';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  getSupportedAssets() {
    return this.assetsService.getSupportedAssets();
  }

  @Get(':symbol')
  @Header('Cache-Control', 'public, max-age=60')
  getAssetBySymbol(@Param('symbol') symbol: string) {
    return this.assetsService.getAssetBySymbol(symbol);
  }
}

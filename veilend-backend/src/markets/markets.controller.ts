import { Controller, Get, Param } from '@nestjs/common';
import { MarketsService, MarketView } from './markets.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  async getMarkets(): Promise<MarketView[]> {
    return this.marketsService.getMarkets();
  }

  @Get(':asset')
  async getMarket(@Param('asset') assetId: string): Promise<MarketView> {
    return this.marketsService.getMarket(assetId);
  }
}

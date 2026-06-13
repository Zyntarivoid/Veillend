import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { PriceOracleService } from './price-oracle.service';
import { SetPriceDto, SetPricesDto, SetPriceSourceDto, SetStalenessDto } from './dto/price-oracle.dto';

@Controller('price-oracle')
export class PriceOracleController {
  constructor(private readonly svc: PriceOracleService) {}

  @Get('price')
  async getPrice(@Query('contract') contract: string, @Query('asset') asset: string) {
    return this.svc.getPrice(contract, asset);
  }

  @Post('set-price')
  async setPrice(@Body() dto: SetPriceDto) {
    return this.svc.setPrice(dto.contract, dto.asset, dto.price);
  }

  @Post('set-prices')
  async setPrices(@Body() dto: SetPricesDto) {
    return this.svc.setPrices(dto.contract, dto.assets, dto.prices);
  }

  @Post('set-price-source')
  async setPriceSource(@Body() dto: SetPriceSourceDto) {
    return this.svc.setPriceSource(dto.contract, dto.asset, dto.source);
  }

  @Post('set-staleness')
  async setStaleness(@Body() dto: SetStalenessDto) {
    return this.svc.setStalenessThreshold(dto.contract, dto.newThreshold);
  }
}

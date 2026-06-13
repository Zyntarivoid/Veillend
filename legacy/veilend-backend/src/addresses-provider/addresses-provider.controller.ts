import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { AddressesProviderService } from './addresses-provider.service';
import { SetAddressDto } from './dto/addresses-provider.dto';

@Controller('addresses-provider')
export class AddressesProviderController {
  constructor(private readonly svc: AddressesProviderService) {}

  @Get('all')
  async getAll(@Query('contract') contract: string) {
    return this.svc.getAllAddresses(contract);
  }

  @Post('set-lending-pool')
  async setLendingPool(@Body() dto: SetAddressDto) {
    return this.svc.setLendingPool(dto.contract, dto.newAddress);
  }

  @Post('set-shielded-pool')
  async setShieldedPool(@Body() dto: SetAddressDto) {
    return this.svc.setShieldedPool(dto.contract, dto.newAddress);
  }

  @Post('set-price-oracle')
  async setPriceOracle(@Body() dto: SetAddressDto) {
    return this.svc.setPriceOracle(dto.contract, dto.newAddress);
  }
}

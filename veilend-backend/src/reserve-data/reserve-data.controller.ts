import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { ReserveDataService } from './reserve-data.service';
import { SetReserveConfigDto, SetReserveStateDto, SetUserReserveDataDto } from './dto/reserve-data.dto';

@Controller('reserve-data')
export class ReserveDataController {
  constructor(private readonly svc: ReserveDataService) {}

  @Get('config')
  async getReserveConfig(@Query('contract') contract: string, @Query('asset') asset: string) {
    return this.svc.getReserveConfig(contract, asset);
  }

  @Post('set-config')
  async setReserveConfig(@Body() dto: SetReserveConfigDto) {
    return this.svc.setReserveConfig(dto.contract, dto.asset, dto.config ?? {});
  }

  @Post('set-state')
  async setReserveState(@Body() dto: SetReserveStateDto) {
    return this.svc.setReserveState(dto.contract, dto.asset, dto.state ?? {});
  }

  @Post('set-user-data')
  async setUserReserveData(@Body() dto: SetUserReserveDataDto) {
    return this.svc.setUserReserveData(dto.contract, dto.user, dto.asset, dto.data ?? {});
  }
}

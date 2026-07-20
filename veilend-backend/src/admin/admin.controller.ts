import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ConfigureAssetDto } from './dto/configure-asset.dto';
import { SetOraclePriceDto } from './dto/set-oracle-price.dto';
import { SetMinCollateralRatioDto } from './dto/set-min-collateral-ratio.dto';
import { AddAdminDto } from './dto/add-admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('admins')
  async addAdmin(@Body() dto: AddAdminDto) {
    return await this.adminService.addAdmin(dto);
  }

  @Delete('admins/:walletAddress')
  async removeAdmin(@Param('walletAddress') walletAddress: string) {
    return await this.adminService.removeAdmin(walletAddress);
  }

  @Get('admins')
  async listAdmins() {
    return await this.adminService.listAdmins();
  }

  @Post('assets/configure')
  configureAsset(@Body() dto: ConfigureAssetDto) {
    return this.adminService.configureAsset(dto);
  }

  @Post('assets/oracle-price')
  setOraclePrice(@Body() dto: SetOraclePriceDto) {
    return this.adminService.setOraclePrice(dto);
  }

  @Post('protocol/min-collateral-ratio')
  setMinCollateralRatio(@Body() dto: SetMinCollateralRatioDto) {
    return this.adminService.setMinCollateralRatio(dto);
  }
}

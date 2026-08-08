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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ConfigureAssetDto } from './dto/configure-asset.dto';
import { SetOraclePriceDto } from './dto/set-oracle-price.dto';
import { SetMinCollateralRatioDto } from './dto/set-min-collateral-ratio.dto';
import { AddAdminDto } from './dto/add-admin.dto';

@ApiTags('admin')
@ApiBearerAuth('JWT')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@ApiForbiddenResponse({ description: 'Caller is not an admin' })
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true }))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('admins')
  @ApiOperation({ summary: 'Grant admin role to a wallet' })
  async addAdmin(@Body() dto: AddAdminDto) {
    return await this.adminService.addAdmin(dto);
  }

  @Delete('admins/:walletAddress')
  @ApiOperation({ summary: 'Revoke admin role from a wallet' })
  async removeAdmin(@Param('walletAddress') walletAddress: string) {
    return await this.adminService.removeAdmin(walletAddress);
  }

  @Get('admins')
  @ApiOperation({ summary: 'List admin wallets' })
  async listAdmins() {
    return await this.adminService.listAdmins();
  }

  @Post('assets/configure')
  @ApiOperation({ summary: 'Configure protocol asset support' })
  configureAsset(@Body() dto: ConfigureAssetDto) {
    return this.adminService.configureAsset(dto);
  }

  @Post('assets/oracle-price')
  @ApiOperation({ summary: 'Set oracle price for an asset' })
  setOraclePrice(@Body() dto: SetOraclePriceDto) {
    return this.adminService.setOraclePrice(dto);
  }

  @Post('protocol/min-collateral-ratio')
  @ApiOperation({ summary: 'Set minimum collateral ratio (bps)' })
  setMinCollateralRatio(@Body() dto: SetMinCollateralRatioDto) {
    return this.adminService.setMinCollateralRatio(dto);
  }
}

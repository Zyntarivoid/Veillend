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
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ConfigureAssetDto } from './dto/configure-asset.dto';
import { SetOraclePriceDto } from './dto/set-oracle-price.dto';
import { SetMinCollateralRatioDto } from './dto/set-min-collateral-ratio.dto';
import { AddAdminDto } from './dto/add-admin.dto';
import { SubmitTxDto } from './dto/submit-tx.dto';
import { WalletAddressParamDto } from '../common/dto/wallet-address-param.dto';
import { PageOptionsDto } from '../common/dto/page-options.dto';
import type { Request } from 'express';

interface AuthenticatedUser {
  walletAddress: string;
  sessionId: string;
  expiresAt: Date;
}

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('admins')
  async addAdmin(@Body() dto: AddAdminDto, @Req() req: RequestWithUser) {
    return await this.adminService.addAdmin(dto, req.user.walletAddress);
  }

  @Delete('admins/:walletAddress')
  async removeAdmin(
    @Param() { walletAddress }: WalletAddressParamDto,
    @Req() req: RequestWithUser,
  ) {
    return await this.adminService.removeAdmin(
      walletAddress,
      req.user.walletAddress,
    );
  }

  @Get('admins')
  async listAdmins() {
    return await this.adminService.listAdmins();
  }

  @Post('assets/configure')
  @HttpCode(HttpStatus.ACCEPTED)
  configureAsset(@Body() dto: ConfigureAssetDto, @Req() req: RequestWithUser) {
    return this.adminService.configureAsset(dto, req.user.walletAddress);
  }

  @Post('assets/oracle-price')
  @HttpCode(HttpStatus.ACCEPTED)
  setOraclePrice(@Body() dto: SetOraclePriceDto, @Req() req: RequestWithUser) {
    return this.adminService.setOraclePrice(dto, req.user.walletAddress);
  }

  @Post('protocol/min-collateral-ratio')
  @HttpCode(HttpStatus.ACCEPTED)
  setMinCollateralRatio(
    @Body() dto: SetMinCollateralRatioDto,
    @Req() req: RequestWithUser,
  ) {
    return this.adminService.setMinCollateralRatio(dto, req.user.walletAddress);
  }

  /**
   * Reports the txHash of the transaction the client signed and submitted
   * for a previously built admin action XDR. Transitions PENDING → SENT.
   */
  @Post('actions/:id/submit-tx')
  @HttpCode(HttpStatus.ACCEPTED)
  submitTx(
    @Param('id') id: string,
    @Body() dto: SubmitTxDto,
    @Req() req: RequestWithUser,
  ) {
    return this.adminService.submitTransaction(
      id,
      dto.txHash,
      req.user.walletAddress,
    );
  }

  /**
   * Returns the intent + status of a previously dispatched admin action.
   */
  @Get('actions/:id')
  getAction(@Param('id') id: string) {
    return this.adminService.getAction(id);
  }

  @Get('audit-log')
  async getAuditLog(@Query() pageOptionsDto: PageOptionsDto) {
    return await this.adminService.getAuditLog(pageOptionsDto);
  }
}

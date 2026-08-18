import {
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
  Ip,
  Headers,
  Param,
} from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { VerifyWalletDto } from './dto/verify-wallet.dto';

import { NonceDto } from './dto/nonce.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireJsonGuard } from './require-json.guard';
import { AdminGuard } from './admin.guard';
import { AuthenticatedRequest } from './types/authenticated-request.type';

@Throttle({ default: { limit: 15, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @UseGuards(RequireJsonGuard)
  @Post('nonce')
  async createNonce(
    @Body() dto: NonceDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    const nonce = await this.authService.generateNonce(
      dto.walletAddress,
      ip,
      userAgent,
      correlationId,
    );

    return {
      nonce,
    };
  }

  @UseGuards(RequireJsonGuard)
  @Post('verify')
  async verify(
    @Body() dto: VerifyWalletDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.authService.verifyWallet(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
      ip,
      userAgent,
      correlationId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  getSession(@Req() req: AuthenticatedRequest): SessionResponseDto {
    return {
      walletAddress: req.user.walletAddress,
      sessionId: req.user.sessionId,
      expiresAt: req.user.expiresAt.toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ revoked: boolean }> {
    await this.authService.revokeSession(
      req.user.sessionId,
      req.user.walletAddress,
      ip,
      userAgent,
      correlationId,
    );
    this.logger.log(`Session revoked for wallet: ${req.user.walletAddress}`);

    return { revoked: true };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('audit/:walletAddress')
  async getAuditLogs(@Param('walletAddress') walletAddress: string) {
    return this.authService.getAuditLogs(walletAddress);
  }
}

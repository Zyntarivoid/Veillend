import { Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';

import { Body } from '@nestjs/common';

import { AuthService } from './auth.service';

import { VerifyWalletDto } from './dto/verify-wallet.dto';

import { NonceDto } from './dto/nonce.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './types/authenticated-request.type';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('nonce')
  async createNonce(@Body() dto: NonceDto) {
    const nonce = await this.authService.generateNonce(dto.walletAddress);

    return {
      nonce,
    };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyWalletDto) {
    return this.authService.verifyWallet(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
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
  ): Promise<{ revoked: boolean }> {
    await this.authService.revokeSession(req.user.sessionId);
    this.logger.log(`Session revoked for wallet: ${req.user.walletAddress}`);

    return { revoked: true };
  }
}

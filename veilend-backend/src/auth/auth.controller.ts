import { Controller, Get, Logger, Post, Req, UseGuards, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { VerifyWalletDto } from './dto/verify-wallet.dto';
import { NonceDto } from './dto/nonce.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './types/authenticated-request.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('nonce')
  @ApiOperation({
    summary: 'Create a one-time auth nonce',
    description:
      'Clients sign the returned nonce with their Stellar wallet and submit it to /auth/verify.',
  })
  @ApiBody({ type: NonceDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: { nonce: 'veilend-login:GA…:1710000000:abc' },
      },
    },
  })
  async createNonce(@Body() dto: NonceDto) {
    const nonce = await this.authService.generateNonce(dto.walletAddress);

    return {
      nonce,
    };
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify wallet signature and open a session',
    description: 'Returns a JWT access token bound to a server-side session.',
  })
  @ApiBody({ type: VerifyWalletDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          accessToken: 'eyJhbGciOi…',
          walletAddress: 'GABC…',
          expiresAt: '2026-08-09T12:00:00.000Z',
        },
      },
    },
  })
  async verify(@Body() dto: VerifyWalletDto) {
    return this.authService.verifyWallet(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Inspect the current session' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  getSession(@Req() req: AuthenticatedRequest): SessionResponseDto {
    return {
      walletAddress: req.user.walletAddress,
      sessionId: req.user.sessionId,
      expiresAt: req.user.expiresAt.toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiOkResponse({
    schema: { example: { success: true, data: { revoked: true } } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  async logout(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ revoked: boolean }> {
    await this.authService.revokeSession(req.user.sessionId);
    this.logger.log(`Session revoked for wallet: ${req.user.walletAddress}`);

    return { revoked: true };
  }
}

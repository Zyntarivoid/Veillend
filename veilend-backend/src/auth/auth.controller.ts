import {
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
  Ip,
  Headers,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { VerifyWalletDto } from './dto/verify-wallet.dto';

import { NonceDto } from './dto/nonce.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RevokeSessionsDto } from './dto/revoke-sessions.dto';
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

  @UseGuards(RequireJsonGuard)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.authService.refreshTokens(
      dto.refreshToken,
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
  @Get('sessions')
  async listSessions(@Req() req: AuthenticatedRequest) {
    const userId = this.requireUserId(req);
    const sessions = await this.authService.listSessions(
      userId,
      req.user.sessionId,
    );
    return { sessions };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeOneSession(
    @Param('id') sessionId: string,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ revoked: boolean }> {
    const userId = this.requireUserId(req);
    await this.authService.revokeSessionById(
      sessionId,
      userId,
      req.user.walletAddress,
      ip,
      userAgent,
      correlationId,
    );
    return { revoked: true };
  }

  // "Logout everywhere". Defaults to keeping the caller's own session alive
  // (`keepCurrent: true`) so this can't accidentally revoke the session the
  // request is being made from; pass `{ keepCurrent: false }` to revoke it too.
  @UseGuards(JwtAuthGuard)
  @Delete('sessions')
  async revokeAllSessions(
    @Body() dto: RevokeSessionsDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ revokedCount: number }> {
    const userId = this.requireUserId(req);
    const keepCurrent = dto.keepCurrent ?? true;

    return this.authService.revokeAllSessions(
      userId,
      req.user.walletAddress,
      keepCurrent ? req.user.sessionId : undefined,
      ip,
      userAgent,
      correlationId,
    );
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

  private requireUserId(req: AuthenticatedRequest): string {
    if (!req.user.userId) {
      throw new UnauthorizedException('No user authenticated');
    }
    return req.user.userId;
  }
}

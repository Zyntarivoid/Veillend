import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  walletAddress: string;
  sub: string; // userId
  jti?: string; // present on tokens issued by the refresh-token-rotation flow
  sid?: string; // sessionId, present alongside jti
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: AppConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.auth.jwtSecret,
      passReqToCallback: true,
    });
  }

  /**
   * Called after JWT signature + expiry are verified by Passport.
   *
   * New-format tokens (carrying `jti` + `sid`) are authorized against the
   * JtiRegistry, which lets a single access token be revoked without
   * deleting its whole session. Older long-form tokens minted before
   * refresh-token rotation shipped carry neither claim; those fall back to
   * the original raw-token session lookup, gated by `LEGACY_AUTH_ALLOW` so
   * the fallback can be turned off once every client has upgraded.
   */
  async validate(req: Request, payload: JwtPayload) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    if (payload.jti && payload.sid) {
      return this.validateJtiToken(
        payload.jti,
        payload.sid,
        payload.walletAddress,
      );
    }

    return this.validateLegacyToken(token);
  }

  private async validateJtiToken(
    jti: string,
    sessionId: string,
    walletAddress: string,
  ) {
    const jtiRow = await this.prisma.jtiRegistry.findUnique({
      where: { jti },
    });

    if (!jtiRow || jtiRow.revokedAt || jtiRow.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session not found or revoked');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found or revoked');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Session has expired');
    }

    return {
      walletAddress,
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
  }

  private async validateLegacyToken(token: string) {
    if (!this.configService.auth.legacyAuthAllow) {
      throw new UnauthorizedException('Legacy token format no longer accepted');
    }

    this.logger.warn(
      'Accepted a legacy (pre-refresh-token) access token via LEGACY_AUTH_ALLOW; ' +
        'client should re-authenticate to receive a refresh token.',
    );

    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found or revoked');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Session has expired');
    }

    return {
      walletAddress: session.user.walletAddress,
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
  }
}

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  walletAddress: string;
  sub: string; // userId
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: AppConfigService,
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
   * We additionally check that the session still exists in the DB
   * (i.e. it hasn't been revoked via logout).
   *
   * `passReqToCallback: true` gives us the raw request so we can
   * extract the bearer token for the session lookup.
   */
  async validate(req: Request, _payload: JwtPayload) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

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
      expiresAt: session.expiresAt,
    };
  }
}

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './types/authenticated-request.type';

interface JwtPayload {
  walletAddress: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev_secret',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    const session = token
      ? await this.prisma.session.findUnique({ where: { token } })
      : null;

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    return {
      walletAddress: payload.walletAddress,
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }
}

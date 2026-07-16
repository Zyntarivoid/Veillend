import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  walletAddress: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'SUPER_SECRET',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.walletAddress) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return { walletAddress: payload.walletAddress };
  }
}

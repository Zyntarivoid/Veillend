import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { typedData, ec } from 'starknet';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async generateNonce(address: string): Promise<string> {
    const nonce = Math.floor(Math.random() * 1000000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await this.usersService.createOrUpdate(address, { nonce, nonce_expires_at: expiresAt });
    return nonce;
  }

  async verifySignature(address: string, signature: string[], typedDataMessage: any, publicKey: string): Promise<any> {
    const user = await this.usersService.findOne(address);
    if (!user || !user.nonce) {
      throw new UnauthorizedException('Nonce not found');
    }

    if (user['nonce_expires_at'] && Date.now() > Number(user['nonce_expires_at'])) {
      throw new UnauthorizedException('Nonce expired');
    }

    if (!typedDataMessage || !typedDataMessage.message || String(typedDataMessage.message.nonce) !== String(user.nonce)) {
      throw new UnauthorizedException('Invalid nonce in message');
    }

    try {
      const messageHash = typedData.getMessageHash(typedDataMessage, address);
      const sigR = BigInt(signature[0]);
      const sigS = BigInt(signature[1]);

      let isVerified = false;
      try {
        isVerified = ec.starkCurve.verify([sigR, sigS] as any, BigInt(messageHash.toString()) as any, BigInt(publicKey) as any);
      } catch (e) {
        try {
          const sigObj = new (ec.starkCurve as any).Signature(sigR, sigS);
          isVerified = ec.starkCurve.verify(sigObj as any, BigInt(messageHash.toString()) as any, BigInt(publicKey) as any);
        } catch (inner) {
          this.logger.error('Signature verification fallback failed', inner);
          throw inner;
        }
      }

      if (!isVerified) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (e) {
      this.logger.error('Signature verification error', e);
      throw new UnauthorizedException('Signature verification failed');
    }

    await this.usersService.createOrUpdate(address, { nonce: null, nonce_expires_at: null });
    return user;
  }

  async login(user: any) {
    const payload = { sub: user.address };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

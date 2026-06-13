import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { typedData, ec } from 'starknet';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async generateNonce(address: string): Promise<string> {
    const nonce = Math.floor(Math.random() * 1000000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    await this.usersService.createOrUpdate(address, { nonce, nonce_expires_at: expiresAt });
    return nonce;
  }

  async verifySignature(address: string, signature: string[], typedDataMessage: any, publicKey: string): Promise<any> {
    const user = await this.usersService.findOne(address);
    if (!user || !user.nonce) {
      throw new UnauthorizedException('Nonce not found');
    }

    // Check nonce expiry if present
    if (user['nonce_expires_at'] && Date.now() > Number(user['nonce_expires_at'])) {
      throw new UnauthorizedException('Nonce expired');
    }

    // Verify nonce matches
    if (!typedDataMessage || !typedDataMessage.message || String(typedDataMessage.message.nonce) !== String(user.nonce)) {
      throw new UnauthorizedException('Invalid nonce in message');
    }

    try {
        // Compute typed data hash
        const messageHash = typedData.getMessageHash(typedDataMessage, address);

        // signature may be hex strings; normalize to BigInt
        const sigR = BigInt(signature[0]);
        const sigS = BigInt(signature[1]);

        // Build signature object depending on starknet ec interface
        let isVerified = false;

        try {
          // Some starknet versions expose verify(signature, msgHash, publicKey)
          // cast to any to accommodate SDK signature types
          isVerified = ec.starkCurve.verify([sigR, sigS] as any, BigInt(messageHash.toString()) as any, BigInt(publicKey) as any);
        } catch (e) {
          // Fallback: construct Signature class if available
          try {
            // @ts-ignore
            const sigObj = new ec.starkCurve.Signature(sigR, sigS);
            // @ts-ignore
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

    // Clear nonce to prevent replay attacks
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

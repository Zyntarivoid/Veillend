import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private walletService: WalletService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  generateNonce(walletAddress: string) {
    const nonce = randomBytes(32).toString('hex');

    this.logger.log(`Nonce created for: ${walletAddress}`);

    return nonce;
  }

  async verifyWallet(walletAddress: string, nonce: string, signature: string) {
    const valid = this.walletService.verifySignature(
      walletAddress,
      nonce,
      signature,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    const user = await this.prisma.user.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
    });

    const token = this.jwtService.sign({ walletAddress });
    const { exp } = this.jwtService.decode<{ exp: number }>(token);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(exp * 1000),
      },
    });

    return {
      accessToken: token,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.delete({ where: { id: sessionId } });
    } catch (error) {
      // Already revoked/gone — logout is idempotent. Anything else is a real failure.
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        )
      ) {
        throw error;
      }
    }
  }
}

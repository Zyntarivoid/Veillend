import {
  Injectable,
  Logger,
  UnauthorizedException,
  GoneException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { randomBytes } from 'crypto';

/** How long a nonce remains valid (5 minutes) */
const NONCE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private walletService: WalletService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  /**
   * Generate a cryptographic nonce, persist it in the WalletNonce table with
   * an expiry timestamp, and return it to the caller for signing.
   *
   * Any previously issued unused nonces for this wallet are invalidated
   * so that only the latest challenge can be used (prevents nonce stacking).
   */
  async generateNonce(walletAddress: string) {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    // Invalidate any prior unused nonces for this wallet
    await this.prisma.walletNonce.updateMany({
      where: { walletAddress, used: false },
      data: { used: true },
    });

    // Persist the new nonce
    await this.prisma.walletNonce.create({
      data: {
        walletAddress,
        nonce,
        expiresAt,
      },
    });

    this.logger.log(`Nonce created for: ${walletAddress}`);

    return nonce;
  }

  /**
   * Verify a signed nonce and issue a session.
   *
   * Replay protection:
   *  1. The nonce must exist in the DB for this wallet address.
   *  2. The nonce must not have been used before.
   *  3. The nonce must not have expired.
   *  4. The signature over the nonce must be valid.
   *  5. The nonce is atomically marked as used.
   */
  async verifyWallet(walletAddress: string, nonce: string, signature: string) {
    // 1. Look up the nonce
    const storedNonce = await this.prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
      orderBy: { expiresAt: 'desc' },
    });

    if (!storedNonce) {
      this.logger.warn(`Verify failed: unknown nonce for ${walletAddress}`);
      throw new UnauthorizedException('Invalid or unknown nonce');
    }

    // 2. Check one-time-use
    if (storedNonce.used) {
      this.logger.warn(
        `Replay attempt detected for ${walletAddress} (nonce already used)`,
      );
      throw new UnauthorizedException(
        'Nonce has already been used - request a new challenge',
      );
    }

    // 3. Check expiry
    if (new Date() > storedNonce.expiresAt) {
      this.logger.warn(`Expired nonce presented for ${walletAddress}`);
      // Mark it used so it can't be retried even if the clock changes
      await this.prisma.walletNonce.update({
        where: { id: storedNonce.id },
        data: { used: true },
      });
      throw new GoneException('Nonce has expired - request a new challenge');
    }

    // 4. Verify the wallet signature
    const valid = this.walletService.verifySignature(
      walletAddress,
      nonce,
      signature,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // 5. Atomically mark the nonce as used
    await this.prisma.walletNonce.update({
      where: { id: storedNonce.id },
      data: { used: true },
    });

    // 6. Upsert user & create session
    const user = await this.prisma.user.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
    });

    const token = this.jwtService.sign({
      walletAddress,
      sub: user.id,
    });

    const { exp } = this.jwtService.decode<{ exp: number }>(token);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(exp * 1000),
      },
    });

    this.logger.log(`Session created for ${walletAddress} (id: ${session.id})`);

    return {
      accessToken: token,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Validate an active session by its JWT token.
   * Returns session info if the session exists and hasn't expired.
   * Throws if the session has been revoked or is not found.
   */
  async validateSession(token: string) {
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

    // Touch lastSeenAt
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      sessionId: session.id,
      walletAddress: session.user.walletAddress,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Revoke a session by its ID. Idempotent - safe to call multiple times.
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.delete({ where: { id: sessionId } });
    } catch (error) {
      // Already revoked/gone - logout is idempotent. Anything else is a real failure.
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

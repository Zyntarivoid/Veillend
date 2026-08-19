import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { randomBytes, randomUUID, createHash } from 'crypto';

/** How long a nonce remains valid (5 minutes) */
const NONCE_TTL_MS = 5 * 60 * 1000;

/** Access token lifetime: short-lived, the only thing accepted by Bearer auth. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token lifetime: long-lived, opaque, one-time-use. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Entropy of the opaque refresh token (bytes, before hex-encoding). */
const REFRESH_TOKEN_BYTES = 64;

function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

interface IssuedTokenPair {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

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
   *
   * The invalidate-then-create pair runs under Serializable isolation so
   * concurrent nonce-generation requests for the same wallet cannot both
   * commit active nonces simultaneously.
   */
  async generateNonce(
    walletAddress: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    await this.prisma.withSerializable(async (tx) => {
      // Invalidate any prior unused nonces for this wallet
      await tx.walletNonce.updateMany({
        where: { walletAddress, used: false },
        data: { used: true },
      });

      // Persist the new nonce
      await tx.walletNonce.create({
        data: {
          walletAddress,
          nonce,
          expiresAt,
        },
      });
    });

    await this.prisma.authAuditLog.create({
      data: {
        walletAddress,
        event: 'NONCE_GENERATED',
        ip,
        userAgent,
        correlationId,
      },
    });

    this.logger.log(`Nonce created for: ${walletAddress}`);

    return nonce;
  }

  /**
   * Mint a fresh access/refresh token pair for a session, inside `tx`.
   *
   * The access token is a short-lived (15min) JWT carrying a `jti` + `sid`
   * (session id); a matching `JtiRegistry` row is written so a single
   * access token can be revoked without touching the rest of the session.
   * The refresh token is an opaque, one-time-use, high-entropy random value
   * (never a JWT) stored hashed (SHA-256) — the raw value is only ever
   * returned to the caller, never persisted.
   */
  private async issueTokenPair(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      walletAddress: string;
      sessionId: string;
      ip?: string;
      userAgent?: string;
    },
  ): Promise<IssuedTokenPair> {
    const jti = randomUUID();
    const accessExpiresAt = new Date(
      Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    );

    const accessToken = this.jwtService.sign(
      {
        walletAddress: params.walletAddress,
        sub: params.userId,
        jti,
        sid: params.sessionId,
      },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    await tx.jtiRegistry.create({
      data: {
        jti,
        userId: params.userId,
        sessionId: params.sessionId,
        expiresAt: accessExpiresAt,
      },
    });

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await tx.refreshToken.create({
      data: {
        userId: params.userId,
        sessionId: params.sessionId,
        tokenHash: hashRefreshToken(refreshToken),
        jti,
        expiresAt: refreshExpiresAt,
        ip: params.ip,
        userAgent: params.userAgent,
      },
    });

    return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt };
  }

  /**
   * Verify a signed nonce and issue a session + token pair.
   *
   * Replay protection:
   *  1. The signature over the nonce must be valid (invalid signatures do
   *     not burn nonces).
   *  2. The nonce is claimed inside a Serializable transaction with a
   *     conditional update that gates on `used = false AND expiresAt > NOW`.
   *     Under concurrency only one request can claim the nonce; the rest
   *     observe zero affected rows and are rejected.
   *  3. A claimed nonce is used to upsert the user, create a session, and
   *     mint an access/refresh token pair, all within the same atomic
   *     Serializable transaction.
   */
  async verifyWallet(
    walletAddress: string,
    nonce: string,
    signature: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    // 1. Signature must be valid before we consume the nonce.
    const valid = this.walletService.verifySignature(
      walletAddress,
      nonce,
      signature,
    );

    if (!valid) {
      this.logger.warn(`Verify failed: invalid signature for ${walletAddress}`);
      await this.logAuthFailure(
        walletAddress,
        'Invalid signature',
        ip,
        userAgent,
        correlationId,
      );
      throw new UnauthorizedException('Authentication failed');
    }

    // 2 + 3. Atomically claim nonce, upsert user, create session, and mint
    //        the token pair under Serializable so concurrent claim attempts
    //        serialize correctly.
    let sessionResult: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      expiresAt: string;
      refreshExpiresAt: string;
      user: { id: string; walletAddress: string };
    } | null = null;

    try {
      sessionResult = await this.prisma.withSerializable(async (tx) => {
        // Atomically claim the nonce. The WHERE clause is the authoritative
        // used/expiry gate, eliminating the TOCTOU race in a read-then-write.
        const { count } = await tx.walletNonce.updateMany({
          where: {
            walletAddress,
            nonce,
            used: false,
            expiresAt: { gt: new Date() },
          },
          data: { used: true },
        });

        if (count === 0) {
          // Run diagnostic outside the serializable tx to avoid blocking it.
          // The tx will be rolled back by throwing here.
          throw Object.assign(new Error('NONCE_CLAIM_FAILED'), {
            __nonce_failed: true,
          });
        }

        // Upsert user & create session within the same transaction.
        const user = await tx.user.upsert({
          where: { walletAddress },
          create: { walletAddress },
          update: {},
        });

        // Created with a placeholder token/expiry — both are filled in below
        // once the real access token exists, since the token pair needs the
        // session id and the session row needs a non-null unique `token`.
        const session = await tx.session.create({
          data: {
            userId: user.id,
            token: randomUUID(),
            expiresAt: new Date(),
            ip,
            userAgent,
          },
        });

        const pair = await this.issueTokenPair(tx, {
          userId: user.id,
          walletAddress,
          sessionId: session.id,
          ip,
          userAgent,
        });

        await tx.session.update({
          where: { id: session.id },
          data: { token: pair.accessToken, expiresAt: pair.accessExpiresAt },
        });

        return {
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          sessionId: session.id,
          expiresAt: pair.accessExpiresAt.toISOString(),
          refreshExpiresAt: pair.refreshExpiresAt.toISOString(),
          user: { id: user.id, walletAddress },
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { __nonce_failed?: boolean }).__nonce_failed
      ) {
        // Determine why and log appropriately.
        await this.handleNonceClaimFailure(
          walletAddress,
          nonce,
          ip,
          userAgent,
          correlationId,
        );
      }
      throw error;
    }

    await this.prisma.authAuditLog.create({
      data: {
        walletAddress,
        event: 'LOGIN_SUCCESS',
        ip,
        userAgent,
        correlationId,
      },
    });

    this.logger.log(
      `Session created for ${walletAddress} (id: ${sessionResult.sessionId})`,
    );

    return sessionResult;
  }

  /**
   * Rotate a refresh token: exchanges a valid, unused refresh token for a
   * brand new access/refresh pair, atomically revoking the old refresh
   * token so it cannot be redeemed again.
   *
   * Reuse detection: if the presented token has already been revoked
   * (rotated out previously, or used by someone else racing this same
   * call), that's a signal the token was captured and replayed — every
   * session for the user is torn down (cascading to all refresh tokens and
   * jtis) so the legitimate user is forced to log back in everywhere.
   */
  async refreshTokens(
    refreshTokenRaw: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    const tokenHash = hashRefreshToken(refreshTokenRaw);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.handleRefreshReuse(
        existing.userId,
        ip,
        userAgent,
        correlationId,
      );
      throw new UnauthorizedException('refresh_token_compromised_log_back_in');
    }

    if (existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let rotated: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      expiresAt: string;
      refreshExpiresAt: string;
    } | null = null;

    try {
      rotated = await this.prisma.withSerializable(async (tx) => {
        // Atomically claim (revoke) this refresh token before minting a
        // successor, so two concurrent redemptions of the same token can't
        // both succeed — the loser observes zero affected rows.
        const { count } = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        if (count === 0) {
          throw Object.assign(new Error('REFRESH_CLAIM_FAILED'), {
            __refresh_claim_failed: true,
          });
        }

        const pair = await this.issueTokenPair(tx, {
          userId: existing.userId,
          walletAddress: user.walletAddress,
          sessionId: existing.sessionId,
          ip,
          userAgent,
        });

        await tx.session.update({
          where: { id: existing.sessionId },
          data: {
            token: pair.accessToken,
            expiresAt: pair.accessExpiresAt,
            lastSeenAt: new Date(),
          },
        });

        return {
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          sessionId: existing.sessionId,
          expiresAt: pair.accessExpiresAt.toISOString(),
          refreshExpiresAt: pair.refreshExpiresAt.toISOString(),
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { __refresh_claim_failed?: boolean }).__refresh_claim_failed
      ) {
        // Someone else claimed this token first between our read and write —
        // indistinguishable from a replay, so respond the same way.
        await this.handleRefreshReuse(
          existing.userId,
          ip,
          userAgent,
          correlationId,
        );
        throw new UnauthorizedException(
          'refresh_token_compromised_log_back_in',
        );
      }
      throw error;
    }

    await this.prisma.authAuditLog.create({
      data: {
        walletAddress: user.walletAddress,
        event: 'TOKEN_REFRESH',
        ip,
        userAgent,
        correlationId,
      },
    });

    return rotated;
  }

  /**
   * Refresh-token-family compromise response: tear down every session the
   * user has (cascades to all RefreshToken/JtiRegistry rows via the FK), so
   * a leaked-and-replayed refresh token can't be used again even for the
   * few minutes its paired access token would otherwise remain valid.
   */
  private async handleRefreshReuse(
    userId: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    await this.prisma.session.deleteMany({ where: { userId } });

    this.logger.warn(
      `Refresh token reuse detected for user ${userId}; all sessions revoked`,
    );

    if (user) {
      await this.prisma.authAuditLog.create({
        data: {
          walletAddress: user.walletAddress,
          event: 'TOKEN_REFRESH_REUSE_DETECTED',
          ip,
          userAgent,
          correlationId,
        },
      });
    }
  }

  /**
   * Classify why an atomic nonce claim affected zero rows and throw the
   * appropriate error. Runs only after the atomic update, so it is purely
   * diagnostic — it never gates authentication.
   */
  private async handleNonceClaimFailure(
    walletAddress: string,
    nonce: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ): Promise<never> {
    const storedNonce = await this.prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
      orderBy: { expiresAt: 'desc' },
    });

    if (!storedNonce) {
      this.logger.warn(`Verify failed: unknown nonce for ${walletAddress}`);
      await this.logAuthFailure(
        walletAddress,
        'Unknown nonce',
        ip,
        userAgent,
        correlationId,
      );
      throw new UnauthorizedException('Authentication failed');
    }

    if (storedNonce.used) {
      this.logger.warn(
        `Replay attempt detected for ${walletAddress} (nonce already used)`,
      );
      await this.logAuthFailure(
        walletAddress,
        'Nonce already used',
        ip,
        userAgent,
        correlationId,
      );
      throw new UnauthorizedException('Authentication failed');
    }

    // Expired — mark it used so it can't be retried even if the clock changes.
    await this.prisma.walletNonce.update({
      where: { id: storedNonce.id },
      data: { used: true },
    });
    await this.logAuthFailure(
      walletAddress,
      'Nonce expired',
      ip,
      userAgent,
      correlationId,
    );
    throw new UnauthorizedException('Authentication failed');
  }

  private async logAuthFailure(
    walletAddress: string,
    reason: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ) {
    await this.prisma.authAuditLog.create({
      data: {
        walletAddress,
        event: 'LOGIN_FAILED',
        reason,
        ip,
        userAgent,
        correlationId,
      },
    });
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
  async revokeSession(
    sessionId: string,
    walletAddress?: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ): Promise<void> {
    try {
      await this.prisma.session.delete({ where: { id: sessionId } });
      if (walletAddress) {
        await this.prisma.authAuditLog.create({
          data: {
            walletAddress,
            event: 'LOGOUT',
            ip,
            userAgent,
            correlationId,
          },
        });
      }
    } catch (error) {
      // Already revoked/gone - logout is idempotent. Anything else is a real failure.
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )) {
        throw error;
      }
    }
  }

  /**
   * Admin-only query to fetch the recent audit logs for a given wallet address.
   */
  async getAuditLogs(walletAddress: string) {
    return this.prisma.authAuditLog.findMany({
      where: { walletAddress },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * List every active session for a user, most recently seen first, so a
   * client can show "log out everywhere but here" style session audit UI.
   */
  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      isCurrent: session.id === currentSessionId,
    }));
  }

  /**
   * Revoke a single session belonging to `userId`. Scoped to the caller's
   * own user id so one user can't revoke another's session by guessing an
   * id; deleting the row cascades to its RefreshToken/JtiRegistry rows.
   * Idempotent, like `revokeSession`.
   */
  async revokeSessionById(
    sessionId: string,
    userId: string,
    walletAddress: string,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });

    if (count === 0) {
      return;
    }

    await this.prisma.authAuditLog.create({
      data: {
        walletAddress,
        event: 'SESSION_REVOKED',
        ip,
        userAgent,
        correlationId,
      },
    });
  }

  /**
   * Revoke every session for a user ("logout everywhere"). By default the
   * caller's own current session is kept active so this can't accidentally
   * log the caller out of the request they're making it from; pass
   * `keepCurrentSessionId: undefined` (or omit it) to revoke that one too.
   */
  async revokeAllSessions(
    userId: string,
    walletAddress: string,
    keepCurrentSessionId: string | undefined,
    ip?: string,
    userAgent?: string,
    correlationId?: string,
  ): Promise<{ revokedCount: number }> {
    const where: Prisma.SessionWhereInput = keepCurrentSessionId
      ? { userId, id: { not: keepCurrentSessionId } }
      : { userId };

    const { count } = await this.prisma.session.deleteMany({ where });

    await this.prisma.authAuditLog.create({
      data: {
        walletAddress,
        event: 'SESSION_REVOKE_ALL',
        ip,
        userAgent,
        correlationId,
      },
    });

    return { revokedCount: count };
  }

  /**
   * Prunes JtiRegistry/RefreshToken rows whose own expiry has passed.
   * Revoked-but-not-yet-expired rows are intentionally left alone — that's
   * what lets `refreshTokens` recognize a replayed, already-rotated-out
   * token as reuse rather than as simply unknown — so this only removes
   * rows that can no longer be used *or* meaningfully replayed. Intended to
   * be called periodically (see TokenCleanupService).
   */
  async cleanupExpiredTokens(): Promise<{
    jtiDeleted: number;
    refreshTokensDeleted: number;
  }> {
    const now = new Date();
    const [jti, refresh] = await Promise.all([
      this.prisma.jtiRegistry.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

    return { jtiDeleted: jti.count, refreshTokensDeleted: refresh.count };
  }
}

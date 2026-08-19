import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WalletService } from './../src/wallet/wallet.service';
import { PrismaService } from './../src/prisma/prisma.service';

// A syntactically valid Stellar Ed25519 public key, needed now that
// walletAddress is validated with @IsStellarAddress() at the API boundary.
const VALID_WALLET_ADDRESS =
  'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

interface FakeSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

interface FakeRefreshToken {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  jti: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface FakeJti {
  jti: string;
  userId: string;
  sessionId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Real Stellar signature verification and a live Postgres connection are
// unnecessary weight for exercising the session lifecycle end-to-end, so
// both are replaced with lightweight in-memory stubs scoped to this spec.
// This fake stands in for PrismaService (not PrismaClient), so it also has
// to provide `withSerializable` — here just an immediate passthrough since
// there's no real concurrency to protect against in-memory.
class FakePrismaService {
  private users = new Map<string, { id: string; walletAddress: string }>();
  private sessions = new Map<string, FakeSession>();
  private nonces = new Map<
    string,
    {
      id: string;
      walletAddress: string;
      nonce: string;
      used: boolean;
      expiresAt: Date;
    }
  >();
  private refreshTokens = new Map<string, FakeRefreshToken>();
  private jtis = new Map<string, FakeJti>();
  private idCounter = 0;

  private nextId(): string {
    this.idCounter += 1;
    return `id-${this.idCounter}`;
  }

  withSerializable = <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);

  user = {
    upsert: ({
      where,
    }: {
      where: { walletAddress: string };
    }): Promise<{ id: string; walletAddress: string }> => {
      const existing = this.users.get(where.walletAddress);
      if (existing) return Promise.resolve(existing);
      const created = { id: this.nextId(), walletAddress: where.walletAddress };
      this.users.set(where.walletAddress, created);
      return Promise.resolve(created);
    },
    findUnique: ({ where }: { where: { id: string } }) => {
      const user =
        [...this.users.values()].find((u) => u.id === where.id) ?? null;
      return Promise.resolve(user);
    },
  };

  session = {
    create: ({
      data,
    }: {
      data: {
        userId: string;
        token: string;
        expiresAt: Date;
        ip?: string | null;
        userAgent?: string | null;
      };
    }) => {
      const now = new Date();
      const record: FakeSession = {
        id: this.nextId(),
        createdAt: now,
        lastSeenAt: now,
        ...data,
      };
      this.sessions.set(record.id, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: { where: { id?: string; token?: string } }) => {
      const session = where.id
        ? this.sessions.get(where.id)
        : [...this.sessions.values()].find((s) => s.token === where.token);
      if (!session) return Promise.resolve(null);
      const user =
        [...this.users.values()].find((u) => u.id === session.userId) ?? null;
      return Promise.resolve({ ...session, user });
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeSession>;
    }) => {
      const existing = this.sessions.get(where.id);
      if (!existing) {
        const err = Object.assign(new Error('not found'), { code: 'P2025' });
        throw err;
      }
      const updated = { ...existing, ...data };
      this.sessions.set(where.id, updated);
      return Promise.resolve(updated);
    },
    delete: ({ where }: { where: { id: string } }) => {
      const entry = this.sessions.get(where.id);
      if (!entry) {
        const err = Object.assign(new Error('not found'), { code: 'P2025' });
        throw err;
      }
      this.sessions.delete(where.id);
      // Mirror the real schema's ON DELETE CASCADE from Session to its
      // RefreshToken/JtiRegistry rows.
      for (const [key, rt] of this.refreshTokens.entries()) {
        if (rt.sessionId === where.id) this.refreshTokens.delete(key);
      }
      for (const [key, jti] of this.jtis.entries()) {
        if (jti.sessionId === where.id) this.jtis.delete(key);
      }
      return Promise.resolve(entry);
    },
    deleteMany: ({
      where,
    }: {
      where: { userId?: string; id?: string | { not: string } };
    }) => {
      let count = 0;
      for (const [id, session] of [...this.sessions.entries()]) {
        if (where.userId !== undefined && session.userId !== where.userId)
          continue;
        if (where.id !== undefined) {
          if (typeof where.id === 'string' && id !== where.id) continue;
          if (typeof where.id === 'object' && id === where.id.not) continue;
        }
        this.sessions.delete(id);
        for (const [key, rt] of this.refreshTokens.entries()) {
          if (rt.sessionId === id) this.refreshTokens.delete(key);
        }
        for (const [key, jti] of this.jtis.entries()) {
          if (jti.sessionId === id) this.jtis.delete(key);
        }
        count += 1;
      }
      return Promise.resolve({ count });
    },
    findMany: ({ where }: { where: { userId: string } }) => {
      const results = [...this.sessions.values()]
        .filter((s) => s.userId === where.userId)
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
      return Promise.resolve(results);
    },
  };

  refreshToken = {
    create: ({
      data,
    }: {
      data: Omit<FakeRefreshToken, 'id' | 'revokedAt'>;
    }) => {
      const record: FakeRefreshToken = {
        id: this.nextId(),
        revokedAt: null,
        ...data,
      };
      this.refreshTokens.set(record.tokenHash, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: { where: { tokenHash: string } }) => {
      return Promise.resolve(this.refreshTokens.get(where.tokenHash) ?? null);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { id: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => {
      let count = 0;
      for (const [key, rt] of this.refreshTokens.entries()) {
        if (rt.id !== where.id) continue;
        if (rt.revokedAt !== null) continue;
        this.refreshTokens.set(key, { ...rt, revokedAt: data.revokedAt });
        count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  jtiRegistry = {
    create: ({ data }: { data: Omit<FakeJti, 'revokedAt'> }) => {
      const record: FakeJti = { revokedAt: null, ...data };
      this.jtis.set(record.jti, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: { where: { jti: string } }) => {
      return Promise.resolve(this.jtis.get(where.jti) ?? null);
    },
  };

  authAuditLog = {
    create: (_args: unknown) => Promise.resolve({}),
  };

  walletNonce = {
    updateMany: ({
      where,
      data,
    }: {
      where: {
        walletAddress: string;
        used?: boolean;
        nonce?: string;
        expiresAt?: { gt: Date };
      };
      data: { used: boolean };
    }) => {
      let count = 0;
      for (const [key, record] of this.nonces.entries()) {
        if (record.walletAddress !== where.walletAddress) continue;
        if (where.used !== undefined && record.used !== where.used) continue;
        if (where.nonce !== undefined && record.nonce !== where.nonce) continue;
        if (
          where.expiresAt?.gt !== undefined &&
          record.expiresAt <= where.expiresAt.gt
        )
          continue;
        this.nonces.set(key, { ...record, used: data.used });
        count += 1;
      }
      return Promise.resolve({ count });
    },
    create: ({
      data,
    }: {
      data: { walletAddress: string; nonce: string; expiresAt: Date };
    }) => {
      const id = this.nextId();
      const record = { id, ...data, used: false };
      this.nonces.set(id, record);
      return Promise.resolve(record);
    },
    findFirst: ({
      where,
    }: {
      where: { walletAddress: string; nonce: string };
    }) => {
      const match = [...this.nonces.values()]
        .filter(
          (n) =>
            n.walletAddress === where.walletAddress && n.nonce === where.nonce,
        )
        .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
      return Promise.resolve(match ?? null);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: { used: boolean };
    }) => {
      const record = this.nonces.get(where.id);
      if (!record) return Promise.resolve(null);
      const updated = { ...record, ...data };
      this.nonces.set(where.id, updated);
      return Promise.resolve(updated);
    },
  };
}

// Successful responses are wrapped by the global TransformInterceptor as
// `{ success: true, data: <payload> }`; only error responses (built by
// AllExceptionsFilter) carry `success`/`error` directly on the body.
function unwrap<T>(res: request.Response): T {
  return (res.body as { data: T }).data;
}

describe('Session lifecycle (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WalletService)
      .useValue({ verifySignature: () => true })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: VALID_WALLET_ADDRESS });
    const { nonce } = unwrap<{ nonce: string }>(nonceRes);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress: VALID_WALLET_ADDRESS,
        nonce,
        signature: 'stubbed',
      });

    return unwrap<{ accessToken: string; refreshToken: string }>(verifyRes);
  }

  it('returns the wallet context for an active session', async () => {
    const { accessToken } = await login();

    const res = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${accessToken}`);
    const body = unwrap<{ walletAddress: string; sessionId: string }>(res);

    expect(res.status).toBe(200);
    expect(body.walletAddress).toBe(VALID_WALLET_ADDRESS);
    expect(typeof body.sessionId).toBe('string');
  });

  it('rejects session introspection without a token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/session');
    const body = res.body as { success: boolean };

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('invalidates the session on logout', async () => {
    const { accessToken } = await login();

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logoutRes.status).toBe(201);
    expect(unwrap<{ revoked: boolean }>(logoutRes)).toEqual({ revoked: true });

    const sessionRes = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(sessionRes.status).toBe(401);
  });

  it('rejects an invalid walletAddress on nonce request', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: 'not-a-key' });
    const body = res.body as {
      success: boolean;
      error: { message: string };
    };

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain(
      'Must be a valid Stellar public key (G...)',
    );
  });

  /**
   * AC: login → confirm authToken present → logout → token absent
   * from server perspective → attempting a portfolio call returns 401,
   * not 200 with stale data.
   */
  it('stale token is rejected after logout — portfolio returns 401, not 200', async () => {
    // 1. Login and confirm a token was issued.
    const { accessToken } = await login();
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);

    // 2. Confirm the session is live (auth/session returns 200).
    const preLogout = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(preLogout.status).toBe(200);

    // 3. Logout — server revokes the session.
    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(logoutRes.status).toBe(201);
    expect(unwrap<{ revoked: boolean }>(logoutRes).revoked).toBe(true);

    // 4. The same token must no longer be accepted by the JWT strategy
    //    (because its jti/session were revoked).
    const postLogoutSession = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(postLogoutSession.status).toBe(401);

    // 5. Attempting a portfolio read with the stale token must return 401,
    //    not 200 with potentially cached data.
    const portfolioRes = await request(app.getHttpServer())
      .get(`/portfolios/${VALID_WALLET_ADDRESS}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(portfolioRes.status).toBe(401);
  });

  /**
   * AC: two verify() calls sharing the same signed payload →
   * second is rejected by backend (nonce already used).
   */
  it('second verify with the same nonce is rejected (nonce replay protection)', async () => {
    // Step 1: obtain a fresh nonce.
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: VALID_WALLET_ADDRESS });
    expect(nonceRes.status).toBe(201);
    const { nonce } = unwrap<{ nonce: string }>(nonceRes);

    // Step 2: first verify succeeds.
    const firstVerify = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress: VALID_WALLET_ADDRESS,
        nonce,
        signature: 'stubbed',
      });
    expect(firstVerify.status).toBe(201);
    expect(
      unwrap<{ accessToken: string }>(firstVerify).accessToken,
    ).toBeTruthy();

    // Step 3: second verify with the SAME nonce+signature must be rejected.
    const secondVerify = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress: VALID_WALLET_ADDRESS,
        nonce,
        signature: 'stubbed',
      });
    expect(secondVerify.status).toBe(401);
  });

  describe('refresh-token rotation', () => {
    it('exchanges a refresh token for a new pair and revokes the old one', async () => {
      const { accessToken: firstAccess, refreshToken: firstRefresh } =
        await login();

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh });

      expect(refreshRes.status).toBe(201);
      const body = unwrap<{ accessToken: string; refreshToken: string }>(
        refreshRes,
      );
      expect(body.accessToken).toBeTruthy();
      expect(body.accessToken).not.toBe(firstAccess);
      expect(body.refreshToken).not.toBe(firstRefresh);

      // The new access token works.
      const sessionRes = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${body.accessToken}`);
      expect(sessionRes.status).toBe(200);

      // Replaying the old refresh token is now rejected as reuse, and tears
      // down the session — the new access token stops working too.
      const replayRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh });
      expect(replayRes.status).toBe(401);

      const postCompromiseSession = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${body.accessToken}`);
      expect(postCompromiseSession.status).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'a'.repeat(128) });
      expect(res.status).toBe(401);
    });
  });

  describe('session management endpoints', () => {
    it('lists the current session and marks it isCurrent', async () => {
      const { accessToken } = await login();

      const res = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const body = unwrap<{
        sessions: Array<{ id: string; isCurrent: boolean }>;
      }>(res);
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].isCurrent).toBe(true);
    });

    it('DELETE /auth/sessions keeps the current session by default', async () => {
      const { accessToken } = await login();

      const res = await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(200);

      const sessionRes = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(sessionRes.status).toBe(200);
    });

    it('DELETE /auth/sessions with keepCurrent:false logs the caller out too', async () => {
      const { accessToken } = await login();

      const res = await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ keepCurrent: false });
      expect(res.status).toBe(200);

      const sessionRes = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(sessionRes.status).toBe(401);
    });
  });
});

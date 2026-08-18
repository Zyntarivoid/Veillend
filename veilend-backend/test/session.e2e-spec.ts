import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  BadRequestException,
  ValidationError,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WalletService } from './../src/wallet/wallet.service';
import { PrismaService } from './../src/prisma/prisma.service';

// A syntactically valid Stellar Ed25519 public key, needed now that
// walletAddress is validated with @IsStellarAddress() at the API boundary.
const VALID_WALLET_ADDRESS =
  'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';

// Real Stellar signature verification and a live Postgres connection are
// unnecessary weight for exercising the session lifecycle end-to-end, so
// both are replaced with lightweight in-memory stubs scoped to this spec.
class FakePrismaService {
  private users = new Map<string, { id: string; walletAddress: string }>();
  private sessions = new Map<
    string,
    { id: string; userId: string; token: string; expiresAt: Date }
  >();
  private nonces = new Map<
    string,
    {
      id: string;
      walletAddress: string;
      nonce: string;
      expiresAt: Date;
      used: boolean;
    }
  >();
  private auditLogs: Array<{
    id: string;
    walletAddress: string;
    event: string;
    reason?: string;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
  }> = [];
  private idCounter = 0;

  private nextId(): string {
    this.idCounter += 1;
    return `id-${this.idCounter}`;
  }

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
        expiresAt?: any;
      };
      data: { used: boolean };
    }) => {
      let count = 0;
      for (const [, nonce] of this.nonces.entries()) {
        const matches =
          nonce.walletAddress === where.walletAddress &&
          (where.used === undefined || nonce.used === where.used) &&
          (where.nonce === undefined || nonce.nonce === where.nonce);
        if (matches) {
          nonce.used = data.used;
          count++;
        }
      }
      return Promise.resolve({ count });
    },
    create: ({
      data,
    }: {
      data: { walletAddress: string; nonce: string; expiresAt: Date };
    }) => {
      const record = { id: this.nextId(), ...data, used: false };
      this.nonces.set(record.nonce, record);
      return Promise.resolve(record);
    },
    findFirst: ({
      where,
      orderBy: _orderBy,
    }: {
      where: { walletAddress: string; nonce?: string };
      orderBy?: any;
    }) => {
      for (const nonce of this.nonces.values()) {
        if (
          nonce.walletAddress === where.walletAddress &&
          (where.nonce === undefined || nonce.nonce === where.nonce)
        ) {
          return Promise.resolve(nonce);
        }
      }
      return Promise.resolve(null);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: { used: boolean };
    }) => {
      for (const nonce of this.nonces.values()) {
        if (nonce.id === where.id) {
          nonce.used = data.used;
          return Promise.resolve(nonce);
        }
      }
      return Promise.resolve(null);
    },
  };

  authAuditLog = {
    create: ({
      data,
    }: {
      data: {
        walletAddress: string;
        event: string;
        reason?: string;
        ip?: string;
        userAgent?: string;
        correlationId?: string;
      };
    }) => {
      const record = { id: this.nextId(), ...data, createdAt: new Date() };
      this.auditLogs.push(record);
      return Promise.resolve(record);
    },
    findMany: ({
      where,
      orderBy: _orderBy,
      take,
    }: {
      where: { walletAddress: string };
      orderBy?: any;
      take?: number;
    }) => {
      const logs = this.auditLogs.filter(
        (log) => log.walletAddress === where.walletAddress,
      );
      return Promise.resolve(take ? logs.slice(0, take) : logs);
    },
  };

  session = {
    create: ({
      data,
    }: {
      data: { userId: string; token: string; expiresAt: Date };
    }) => {
      const record = { id: this.nextId(), ...data, lastSeenAt: new Date() };
      this.sessions.set(record.token, record);
      return Promise.resolve(record);
    },
    findUnique: ({
      where,
      include,
    }: {
      where: { token: string };
      include?: { user?: boolean };
    }) => {
      const session = this.sessions.get(where.token);
      if (!session) return Promise.resolve(null);

      if (include?.user) {
        const user = [...this.users.values()].find(
          (u) => u.id === session.userId,
        );
        return Promise.resolve({ ...session, user: user ?? null });
      }
      return Promise.resolve(session);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: { lastSeenAt?: Date };
    }) => {
      const entry = [...this.sessions.values()].find((s) => s.id === where.id);
      if (!entry) return Promise.resolve(null);
      Object.assign(entry, data);
      return Promise.resolve(entry);
    },
    delete: ({ where }: { where: { id: string } }) => {
      const entry = [...this.sessions.values()].find((s) => s.id === where.id);
      if (!entry) {
        const err = Object.assign(new Error('not found'), { code: 'P2025' });
        throw err;
      }
      this.sessions.delete(entry.token);
      return Promise.resolve(entry);
    },
  };
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) => {
          const message = errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; ');
          return new BadRequestException(message || 'Validation failed');
        },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: VALID_WALLET_ADDRESS });
    const nonceBody = nonceRes.body as {
      success: boolean;
      data: { nonce: string };
    };

    // 88-char base64 signature (valid format for DTO validation)
    const fakeSignature = 'A'.repeat(86) + '==';

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress: VALID_WALLET_ADDRESS,
        nonce: nonceBody.data.nonce,
        signature: fakeSignature,
      });
    const verifyBody = verifyRes.body as {
      success: boolean;
      data: { accessToken: string };
    };

    return verifyBody.data.accessToken;
  }

  it('returns the wallet context for an active session', async () => {
    const token = await login();

    const res = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`);
    const body = res.body as {
      success: boolean;
      data: { walletAddress: string; sessionId: string };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.walletAddress).toBe(VALID_WALLET_ADDRESS);
    expect(typeof body.data.sessionId).toBe('string');
  });

  it('rejects session introspection without a token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/session');
    const body = res.body as { success: boolean };

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('invalidates the session on logout', async () => {
    const token = await login();

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body).toEqual({ success: true, data: { revoked: true } });

    const sessionRes = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`);

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
});

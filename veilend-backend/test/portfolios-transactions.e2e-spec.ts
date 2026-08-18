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

// Two syntactically valid Stellar Ed25519 public keys.
const OWN_WALLET = 'GBJEI2M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH';
const OTHER_WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

interface FakeUser {
  id: string;
  walletAddress: string;
}

// A minimal in-memory Prisma stand-in covering exactly what the auth flow,
// PortfoliosController and TransactionsController touch, so these specs
// don't need a live Postgres connection.
class FakePrismaService {
  private users = new Map<string, FakeUser>();
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
    }): Promise<FakeUser> => {
      const existing = this.users.get(where.walletAddress);
      if (existing) return Promise.resolve(existing);
      const created = { id: this.nextId(), walletAddress: where.walletAddress };
      this.users.set(where.walletAddress, created);
      return Promise.resolve(created);
    },
    findUnique: ({
      where,
    }: {
      where: { walletAddress: string };
    }): Promise<FakeUser | null> => {
      return Promise.resolve(this.users.get(where.walletAddress) ?? null);
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
    }: {
      where: { walletAddress: string; nonce?: string };
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
      take,
    }: {
      where: { walletAddress: string };
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
  };

  admin = {
    findUnique: (): Promise<null> => Promise.resolve(null),
  };

  position = {
    findMany: (): Promise<unknown[]> => Promise.resolve([]),
  };

  transactionHistory = {
    findMany: (): Promise<unknown[]> => Promise.resolve([]),
    count: (): Promise<number> => Promise.resolve(0),
  };
}

describe('Portfolios & Transactions (e2e)', () => {
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

  async function login(walletAddress: string): Promise<string> {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress });
    const nonceBody = nonceRes.body as {
      success: boolean;
      data: { nonce: string };
    };

    // 88-char base64 signature (valid format for DTO validation)
    const fakeSignature = 'A'.repeat(86) + '==';

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress,
        nonce: nonceBody.data.nonce,
        signature: fakeSignature,
      });
    const verifyBody = verifyRes.body as {
      success: boolean;
      data: { accessToken: string };
    };

    return verifyBody.data.accessToken;
  }

  it('rejects unauthenticated requests to /portfolios/:walletAddress', async () => {
    const res = await request(app.getHttpServer()).get(
      `/portfolios/${OWN_WALLET}`,
    );
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated requests to /transactions/:walletAddress', async () => {
    const res = await request(app.getHttpServer()).get(
      `/transactions/${OWN_WALLET}`,
    );
    expect(res.status).toBe(401);
  });

  it('returns a single response envelope for /portfolios/:walletAddress', async () => {
    const token = await login(OWN_WALLET);

    const res = await request(app.getHttpServer())
      .get(`/portfolios/${OWN_WALLET}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    const data = body.data as Record<string, unknown>;
    // Exactly one envelope: the inner payload must not itself look wrapped.
    expect(data.success).toBeUndefined();
    expect(data.walletAddress).toBe(OWN_WALLET);
  });

  it('returns a single response envelope for /transactions/:walletAddress', async () => {
    const token = await login(OWN_WALLET);

    const res = await request(app.getHttpServer())
      .get(`/transactions/${OWN_WALLET}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.success).toBeUndefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toBeDefined();
  });

  it("returns 403 when a non-admin requests another wallet's portfolio", async () => {
    const token = await login(OWN_WALLET);

    const res = await request(app.getHttpServer())
      .get(`/portfolios/${OTHER_WALLET}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("returns 403 when a non-admin requests another wallet's transactions", async () => {
    const token = await login(OWN_WALLET);

    const res = await request(app.getHttpServer())
      .get(`/transactions/${OTHER_WALLET}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

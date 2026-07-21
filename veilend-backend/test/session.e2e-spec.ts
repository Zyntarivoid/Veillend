import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WalletService } from './../src/wallet/wallet.service';
import { PrismaService } from './../src/prisma/prisma.service';

// Real Stellar signature verification and a live Postgres connection are
// unnecessary weight for exercising the session lifecycle end-to-end, so
// both are replaced with lightweight in-memory stubs scoped to this spec.
class FakePrismaService {
  private users = new Map<string, { id: string; walletAddress: string }>();
  private sessions = new Map<
    string,
    { id: string; userId: string; token: string; expiresAt: Date }
  >();
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

  session = {
    create: ({
      data,
    }: {
      data: { userId: string; token: string; expiresAt: Date };
    }) => {
      const record = { id: this.nextId(), ...data };
      this.sessions.set(record.token, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: { where: { token: string } }) => {
      return Promise.resolve(this.sessions.get(where.token) ?? null);
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(): Promise<string> {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: 'GABC' });
    const nonceBody = nonceRes.body as { nonce: string };

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        walletAddress: 'GABC',
        nonce: nonceBody.nonce,
        signature: 'stubbed',
      });
    const verifyBody = verifyRes.body as { accessToken: string };

    return verifyBody.accessToken;
  }

  it('returns the wallet context for an active session', async () => {
    const token = await login();

    const res = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`);
    const body = res.body as { walletAddress: string; sessionId: string };

    expect(res.status).toBe(200);
    expect(body.walletAddress).toBe('GABC');
    expect(typeof body.sessionId).toBe('string');
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
    expect(logoutRes.body).toEqual({ revoked: true });

    const sessionRes = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${token}`);

    expect(sessionRes.status).toBe(401);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Correlation ID (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('generates a correlation id when none is supplied', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.headers['x-correlation-id']).toMatch(UUID_RE);
  });

  it('echoes back a valid incoming correlation id', async () => {
    const incoming = '11111111-2222-4333-8444-555555555555';

    const res = await request(app.getHttpServer())
      .get('/')
      .set('x-correlation-id', incoming);

    expect(res.headers['x-correlation-id']).toBe(incoming);
  });

  it('generates a fresh id when the incoming header is malformed', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('x-correlation-id', "'; DROP TABLE users; --");

    expect(res.headers['x-correlation-id']).toMatch(UUID_RE);
    expect(res.headers['x-correlation-id']).not.toBe("'; DROP TABLE users; --");
  });

  it('includes the correlation id in error response bodies', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist');
    const body = res.body as {
      success: boolean;
      meta?: { correlationId?: string };
    };

    expect(res.status).toBe(404);
    expect(body.meta?.correlationId).toBe(res.headers['x-correlation-id']);
    expect(body.success).toBe(false);
  });
});

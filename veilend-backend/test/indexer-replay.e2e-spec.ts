import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Indexer Replay E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /indexer/replay - Auth Guards', () => {
    it('should return 401 when no authentication is provided', async () => {
      return request(app.getHttpServer()).post('/indexer/replay').expect(401);
    });

    it('should return 403 when authenticated user is not an admin', async () => {
      // This test assumes you have a way to authenticate a non-admin user
      // You may need to adjust this based on your actual auth setup
      const nonAdminToken = 'valid-non-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .expect(403);
    });

    it('should return 200 when authenticated user is an admin', async () => {
      // This test assumes you have a way to authenticate an admin user
      // You may need to adjust this based on your actual auth setup
      const adminToken = 'valid-admin-jwt-token';

      // Mock the indexer service to prevent actual replay
      // This may require additional setup in your test environment

      return request(app.getHttpServer())
        .post('/indexer/replay')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /indexer/replay - Confirm Header Logic', () => {
    it('should return 400 when scope=full without x-confirm-full-wipe header', async () => {
      const adminToken = 'valid-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should return 400 when scope=full with x-confirm-full-wipe header not set to yes', async () => {
      const adminToken = 'valid-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-confirm-full-wipe', 'no')
        .expect(400);
    });

    it('should return 200 when scope=full with x-confirm-full-wipe: yes header', async () => {
      const adminToken = 'valid-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay?scope=full')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-confirm-full-wipe', 'yes')
        .expect(200);
    });

    it('should return 200 when scope=bad-only without confirm header (default behavior)', async () => {
      const adminToken = 'valid-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay?scope=bad-only')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should return 200 when no scope provided (defaults to bad-only)', async () => {
      const adminToken = 'valid-admin-jwt-token';

      return request(app.getHttpServer())
        .post('/indexer/replay')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /indexer/replay - Conflict Checks', () => {
    it('should return 409 when indexer is already processing', async () => {
      const adminToken = 'valid-admin-jwt-token';

      // This test requires the indexer to be in a processing state
      // You may need to set up the state before this test

      return request(app.getHttpServer())
        .post('/indexer/replay')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('should return 409 when replay is already running', async () => {
      const adminToken = 'valid-admin-jwt-token';

      // This test requires another replay to be in progress
      // You may need to set up the state before this test

      return request(app.getHttpServer())
        .post('/indexer/replay')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });
});

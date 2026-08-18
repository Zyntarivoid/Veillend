import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// Minimal fake PrismaService – app.e2e only exercises the root endpoint,
// so we just need to prevent a real database connection.
class FakePrismaService {
  async onModuleInit() {
    /* no-op */
  }
  async onModuleDestroy() {
    /* no-op */
  }
  $connect() {
    return Promise.resolve();
  }
  $disconnect() {
    return Promise.resolve();
  }
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        const body = res.body as { success: boolean; data: string };
        if (body.success !== true || body.data !== 'Hello World!') {
          throw new Error(
            `Expected {success:true,data:"Hello World!"} but got ${JSON.stringify(body)}`,
          );
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

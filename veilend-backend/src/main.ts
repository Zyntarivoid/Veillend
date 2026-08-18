import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/app-logger.service';
import { AppConfigService } from './config/app-config.service';
import { createOriginCheckMiddleware } from './middleware/origin-check';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(app.get(AppLoggerService));

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

  // ── CORS allowlist ────────────────────────────────────────────────────────
  const envOrigins = process.env.CORS_ORIGINS ?? '';
  const allowlist: string[] = [
    'http://localhost:3000',
    'http://localhost:8081',
    ...(envOrigins
      ? envOrigins
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : []),
  ];

  // Reject cross-origin requests whose Origin is not in the allowlist (403)
  app.use(createOriginCheckMiddleware(allowlist));

  app.enableCors({
    origin: allowlist,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });

  // ── Security headers ──────────────────────────────────────────────────────
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
    }),
  );

  app.use(
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      next();
    },
  );

  // ── Body size limits ──────────────────────────────────────────────────────
  app.use('/indexer/replay', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  const config = app.get(AppConfigService);
  await app.listen(config.port);
}
void bootstrap();

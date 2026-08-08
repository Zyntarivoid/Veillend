import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * OpenAPI / Swagger setup for the VeilLend backend.
 *
 * UI:    GET /api/docs
 * JSON:  GET /api/docs-json
 *
 * ## API versioning strategy
 *
 * - The current public surface is **v1**.
 * - Today routes are served at the root (`/auth`, `/portfolios`, …) so existing
 *   mobile and web clients keep working without a forced migration.
 * - Responses include the `X-API-Version: 1` header so clients can detect the
 *   active major version.
 * - The next breaking release will introduce a URI prefix (`/api/v2/...`).
 *   Non-breaking additive endpoints may land on v1 until then.
 * - OpenAPI `info.version` tracks the documented contract (semver for the API
 *   document, independent of the npm package version).
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('VeilLend Backend API')
    .setDescription(
      [
        'REST API for VeilLend on Stellar/Soroban: wallet auth, portfolios,',
        'assets, protocol config, transactions, indexer status, and admin.',
        '',
        '### Versioning',
        'Current major version: **v1** (root paths). See `X-API-Version` response header.',
        'Breaking changes will be introduced under `/api/v2` in a future release.',
        '',
        '### Response envelope',
        'Successful JSON bodies are typically wrapped as',
        '`{ "success": true, "data": ..., "meta": ... }`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from POST /auth/verify',
      },
      'JWT',
    )
    .addTag('health', 'Liveness and process metadata')
    .addTag('auth', 'Wallet signature authentication and sessions')
    .addTag('portfolios', 'Wallet-scoped dashboard portfolio reads')
    .addTag('assets', 'Supported asset registry')
    .addTag('protocol', 'Protocol configuration and risk parameters')
    .addTag('transactions', 'Wallet activity / history')
    .addTag('indexer', 'On-chain indexer status and positions')
    .addTag('admin', 'Admin-only protocol operations')
    .addServer('/', 'Current v1 surface (root paths)')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'VeilLend API Docs',
  });
}

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VeilLend Backend API')
    .setDescription(
      'Public API documentation for the active VeilLend backend endpoints. Versioned routes use the /v1 prefix; unversioned root health routes remain available for platform probes.',
    )
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addTag('root', 'Unversioned liveness and service metadata')
    .addTag('auth', 'Wallet nonce and signature verification')
    .addTag('indexer', 'Indexer status, indexed positions, and transaction feeds')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

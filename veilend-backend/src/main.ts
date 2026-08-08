import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logging/app-logger.service';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './common/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLoggerService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  setupSwagger(app);

  const config = app.get(AppConfigService);
  await app.listen(config.port);

  const logger = app.get(AppLoggerService);
  logger.log(
    `Swagger UI available at http://localhost:${config.port}/api/docs`,
    'Bootstrap',
  );
}
void bootstrap();

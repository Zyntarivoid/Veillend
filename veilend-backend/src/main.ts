import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors();

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('VeilLend API')
    .setDescription('The VeilLend Backend API description')
    .setVersion('1.0')
    .addTag('auth')
    .addTag('users')
    .addTag('transactions')
    .addTag('assets')
    .addTag('positions')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

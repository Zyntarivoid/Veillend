import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { ValidationExceptionFilter } from './common/validation-exception.filter';
import { buildValidationErrorResponse } from './common/validation.util';
import { BadRequestException, ValidationError } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details: buildValidationErrorResponse(errors),
          },
        }),
    }),
  );

  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new ValidationExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

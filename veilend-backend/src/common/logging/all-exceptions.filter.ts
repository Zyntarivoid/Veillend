import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ApiResponseDto } from '../dto/api-response.dto';
import { AppLoggerService } from './app-logger.service';
import { redact } from './redact.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly cls: ClsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';
    const details =
      exception instanceof HttpException
        ? redact(exception.getResponse())
        : undefined;

    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;

    this.logger.error(
      `Unhandled exception on request: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    const body = ApiResponseDto.fail(
      exception instanceof HttpException
        ? exception.constructor.name
        : 'InternalServerError',
      message,
      details,
    );

    res.status(status).json({
      ...body,
      meta: { ...(body.meta as object | undefined), correlationId },
    });
  }
}

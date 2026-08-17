import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const mapped = this.mapException(exception);
    const { status, message, code, details } = mapped;

    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;
    if (correlationId) {
      res.setHeader('x-correlation-id', correlationId);
    }

    this.logger.error(
      `Unhandled exception on request: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    const body = ApiResponseDto.fail(code, message, details);

    res.status(status).json({
      ...body,
      meta: { ...(body.meta as object | undefined), correlationId },
    });
  }

  private mapException(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        code: exception.constructor.name,
        message: exception.message,
        details: redact(exception.getResponse()),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: 409,
            code: 'PrismaUniqueConstraintError',
            message: 'Unique constraint violation',
          };
        case 'P2003':
          return {
            status: 400,
            code: 'PrismaForeignKeyConstraintError',
            message: 'Foreign key constraint violation',
          };
        case 'P2025':
          return {
            status: 404,
            code: 'PrismaRecordNotFoundError',
            message: 'Record not found',
          };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: 400,
        code: 'PrismaValidationError',
        message: 'Invalid database query',
      };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: 503,
        code: 'PrismaInitializationError',
        message: 'Database unavailable',
      };
    }

    return {
      status: 500,
      code: 'InternalServerError',
      message: 'Internal server error',
    };
  }
}

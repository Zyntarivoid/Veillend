import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { ApiResponseDto } from '../dto/api-response.dto';
import { AppLoggerService } from './app-logger.service';
import { mapExceptionToError } from './error-codes';
import { ErrorMonitoringService } from './error-monitoring.service';
import { redact } from './redact.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly cls: ClsService,
    private readonly errorMonitoring: ErrorMonitoringService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const mapped = mapExceptionToError(exception);
    const details = mapped.details
      ? redact(mapped.details)
      : undefined;

    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;

    // Never log full exception response bodies that may contain secrets —
    // message + stack is enough for ops; details are redacted in the client body.
    this.logger.error(
      {
        event: 'request_error',
        code: mapped.code,
        status: mapped.status,
        method: req?.method,
        path: this.safePath(req),
        message: mapped.message,
      },
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    if (mapped.status >= 500) {
      this.errorMonitoring.notify({
        level: mapped.status >= 500 ? 'critical' : 'error',
        code: mapped.code,
        message: mapped.message,
        status: mapped.status,
        correlationId,
        path: this.safePath(req),
        method: req?.method,
        detail:
          exception instanceof Error
            ? exception.stack?.split('\n').slice(0, 5).join('\n')
            : undefined,
      });
    }

    const body = ApiResponseDto.fail(mapped.code, mapped.message, details);

    res.status(mapped.status).json({
      ...body,
      meta: { ...(body.meta as object | undefined), correlationId },
    });
  }

  private safePath(req?: Request): string | undefined {
    if (!req?.originalUrl && !req?.url) return undefined;
    const raw = req.originalUrl ?? req.url;
    // Strip query string so tokens in ?access_token= never hit logs/hooks.
    const q = raw.indexOf('?');
    return q === -1 ? raw : raw.slice(0, q);
  }
}

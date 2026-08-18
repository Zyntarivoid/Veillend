import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLoggerService } from './app-logger.service';

/**
 * Mask an IPv4 address by zeroing the last octet (/24).
 * Falls back to the raw value when the IP cannot be parsed.
 */
function maskIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
  const v4 = ip.replace(/^::ffff:/, '');
  const parts = v4.split('.');
  if (parts.length === 4) {
    parts[3] = '0';
    return parts.join('.');
  }
  // IPv6 or unparseable – just return as-is
  return v4;
}

type RequestUser = {
  walletAddress?: string;
  sessionId?: string;
};

type RequestWithUser = Request & { user?: RequestUser };

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const start = Date.now();

    const method = req.method;
    const url = req.url;
    const ip = maskIp(req.ip ?? req.socket?.remoteAddress);

    this.logger.log(
      JSON.stringify({
        event: 'request_start',
        method,
        url,
        ip,
      }),
      'HTTP',
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            JSON.stringify({
              event: 'request_end',
              method,
              url,
              ip,
              status_code: res.statusCode,
              duration_ms: Date.now() - start,
            }),
            'HTTP',
          );
        },
        error: (error: unknown) => {
          const res = context.switchToHttp().getResponse<Response>();
          const statusCode =
            error instanceof HttpException ? error.getStatus() : res.statusCode;

          this.logger.warn(this.buildLogRecord(req, statusCode, start), 'HTTP');
        },
      }),
    );
  }

  private buildLogRecord(
    req: RequestWithUser,
    statusCode: number,
    start: number,
  ) {
    return {
      method: req.method,
      url: req.url,
      statusCode,
      dtMs: Date.now() - start,
      correlationId: this.cls.isActive() ? this.cls.getId() : null,
      walletAddress: req.user?.walletAddress ?? null,
      sessionId: req.user?.sessionId ?? null,
    };
  }
}

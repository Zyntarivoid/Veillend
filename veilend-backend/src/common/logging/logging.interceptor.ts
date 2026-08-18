import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
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
        error: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.warn(
            JSON.stringify({
              event: 'request_end',
              method,
              url,
              ip,
              status_code: res.statusCode ?? 500,
              duration_ms: Date.now() - start,
            }),
            'HTTP',
          );
        },
      }),
    );
  }
}

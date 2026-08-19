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

type RequestUser = {
  walletAddress?: string;
  sessionId?: string;
};

type RequestWithUser = Request & { user?: RequestUser };

function maskIp(ip?: string): string | null {
  if (!ip || typeof ip !== 'string') return null;
  const cleanIp = ip.replace(/^::ffff:/, '');
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    if (parts.length > 2) {
      return parts.slice(0, 3).join(':') + '::';
    }
  }
  return cleanIp;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const start = Date.now();
    const correlationId = this.cls.isActive() ? this.cls.getId() : null;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
    const maskedIp = maskIp(clientIp);

    // Emit request_start
    this.logger.debug(
      {
        event: 'request_start',
        method: req.method,
        url: req.url,
        ip: maskedIp,
        correlationId,
      },
      'HTTP',
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            this.buildLogRecord(req, res.statusCode, start, maskedIp),
            'HTTP',
          );
        },
        error: (error: unknown) => {
          const res = context.switchToHttp().getResponse<Response>();
          const statusCode =
            error instanceof HttpException ? error.getStatus() : res.statusCode;
          this.logger.warn(
            this.buildLogRecord(req, statusCode, start, maskedIp),
            'HTTP',
          );
        },
      }),
    );
  }

  private buildLogRecord(
    req: RequestWithUser,
    statusCode: number,
    start: number,
    maskedIp: string | null,
  ) {
    const durationMs = Date.now() - start;
    return {
      event: 'request_end',
      method: req.method,
      url: req.url,
      statusCode,
      duration_ms: durationMs,
      dtMs: durationMs,
      ip: maskedIp,
      correlationId: this.cls.isActive() ? this.cls.getId() : null,
      walletAddress: req.user?.walletAddress ?? null,
      sessionId: req.user?.sessionId ?? null,
    };
  }
}

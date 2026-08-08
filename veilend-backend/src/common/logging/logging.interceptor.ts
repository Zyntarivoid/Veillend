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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();
    const path = this.safePath(req);

    this.logger.log(
      { event: 'request_start', method: req.method, path },
      'HTTP',
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            {
              event: 'request_end',
              method: req.method,
              path,
              statusCode: res.statusCode,
              durationMs: Date.now() - start,
            },
            'HTTP',
          );
        },
        error: () => {
          this.logger.warn(
            {
              event: 'request_failed',
              method: req.method,
              path,
              durationMs: Date.now() - start,
            },
            'HTTP',
          );
        },
      }),
    );
  }

  private safePath(req: Request): string {
    const raw = req.originalUrl ?? req.url ?? '';
    const q = raw.indexOf('?');
    return q === -1 ? raw : raw.slice(0, q);
  }
}

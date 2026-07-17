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

    this.logger.log(`--> ${req.method} ${req.url}`, 'HTTP');

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            `<-- ${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`,
            'HTTP',
          );
        },
        error: () => {
          this.logger.warn(
            `<-x ${req.method} ${req.url} ${Date.now() - start}ms`,
            'HTTP',
          );
        },
      }),
    );
  }
}

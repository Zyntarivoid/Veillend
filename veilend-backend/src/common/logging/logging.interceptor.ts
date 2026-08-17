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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            this.buildLogRecord(req, res.statusCode, start),
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

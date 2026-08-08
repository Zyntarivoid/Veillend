import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Response } from 'express';

/** Active public API major version advertised to clients. */
export const API_MAJOR_VERSION = '1';

export const API_VERSION_HEADER = 'X-API-Version';

/**
 * Adds `X-API-Version` so clients can detect the contract major version
 * without parsing path prefixes (v1 is currently root-mounted).
 */
@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader(API_VERSION_HEADER, API_MAJOR_VERSION);
    return next.handle();
  }
}

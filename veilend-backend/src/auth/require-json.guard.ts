import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class RequireJsonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (
      request.method === 'POST' ||
      request.method === 'PUT' ||
      request.method === 'PATCH'
    ) {
      const contentType = request.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        throw new UnsupportedMediaTypeException(
          'Content-Type must be application/json',
        );
      }
    }

    return true;
  }
}

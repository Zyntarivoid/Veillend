import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode, mapExceptionToError } from './error-codes';

describe('mapExceptionToError', () => {
  it('maps bare errors to INTERNAL_ERROR 500', () => {
    expect(mapExceptionToError(new Error('x'))).toEqual({
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
  });

  it('maps UnauthorizedException', () => {
    const mapped = mapExceptionToError(new UnauthorizedException());
    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('maps NotFoundException', () => {
    const mapped = mapExceptionToError(new NotFoundException('missing'));
    expect(mapped.status).toBe(404);
    expect(mapped.code).toBe(ErrorCode.NOT_FOUND);
    expect(mapped.message).toContain('missing');
  });

  it('maps validation-style BadRequest to VALIDATION_ERROR', () => {
    const mapped = mapExceptionToError(
      new BadRequestException({
        message: ['field is required'],
        error: 'Bad Request',
        statusCode: 400,
      }),
    );
    expect(mapped.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mapped.status).toBe(400);
  });
});

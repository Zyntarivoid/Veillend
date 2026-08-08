import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Stable API error codes returned in `{ error: { code } }`.
 * Clients should branch on these rather than free-form messages.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  UNPROCESSABLE: 'UNPROCESSABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Map Nest HTTP exceptions (and bare errors) to a stable code + status.
 */
export function mapExceptionToError(
  exception: unknown,
): { status: number; code: ErrorCodeValue; message: string; details?: unknown } {
  if (!(exception instanceof HttpException)) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  const status = exception.getStatus();
  const response = exception.getResponse();
  const message =
    typeof response === 'string'
      ? response
      : typeof response === 'object' &&
          response !== null &&
          'message' in response
        ? Array.isArray((response as { message: unknown }).message)
          ? ((response as { message: string[] }).message).join('; ')
          : String((response as { message: unknown }).message)
        : exception.message;

  const details =
    typeof response === 'object' && response !== null ? response : undefined;

  if (exception instanceof UnauthorizedException) {
    return { status, code: ErrorCode.UNAUTHORIZED, message, details };
  }
  if (exception instanceof ForbiddenException) {
    return { status, code: ErrorCode.FORBIDDEN, message, details };
  }
  if (exception instanceof NotFoundException) {
    return { status, code: ErrorCode.NOT_FOUND, message, details };
  }
  if (exception instanceof UnprocessableEntityException) {
    return { status, code: ErrorCode.UNPROCESSABLE, message, details };
  }
  if (exception instanceof BadRequestException || status === 400) {
    // Nest ValidationPipe uses BadRequestException with message: string[]
    const isValidation =
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      Array.isArray((response as { message: unknown }).message);
    return {
      status,
      code: isValidation ? ErrorCode.VALIDATION_ERROR : ErrorCode.BAD_REQUEST,
      message,
      details,
    };
  }
  if (status === HttpStatus.CONFLICT) {
    return { status, code: ErrorCode.CONFLICT, message, details };
  }
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return { status, code: ErrorCode.TOO_MANY_REQUESTS, message, details };
  }
  if (status >= 500) {
    return { status, code: ErrorCode.INTERNAL_ERROR, message, details };
  }

  return { status, code: ErrorCode.HTTP_ERROR, message, details };
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch(HttpException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    const payload = {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details:
          typeof exceptionResponse === 'object' && exceptionResponse?.error?.details
            ? exceptionResponse.error.details
            : exceptionResponse,
      },
    };

    response.status(status ?? HttpStatus.BAD_REQUEST).json(payload);
  }
}

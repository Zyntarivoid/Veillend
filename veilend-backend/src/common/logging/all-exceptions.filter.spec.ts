/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppLoggerService } from './app-logger.service';
import { ClsService } from 'nestjs-cls';
import { ErrorMonitoringService } from './error-monitoring.service';
import { ErrorCode } from './error-codes';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: { error: jest.Mock };
  let cls: { isActive: jest.Mock; getId: jest.Mock };
  let monitoring: { notify: jest.Mock };
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  function makeHost(): ArgumentsHost {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    const res = { status: statusSpy };
    return {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/auth/verify?token=secret',
          url: '/auth/verify?token=secret',
        }),
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    logger = { error: jest.fn() };
    cls = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('corr-abc'),
    };
    monitoring = { notify: jest.fn() };
    filter = new AllExceptionsFilter(
      logger as unknown as AppLoggerService,
      cls as unknown as ClsService,
      monitoring as unknown as ErrorMonitoringService,
    );
  });

  it('formats an HttpException with stable code and correlationId', () => {
    const exception = new BadRequestException('bad input');

    filter.catch(exception, makeHost());

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'bad input',
          code: ErrorCode.BAD_REQUEST,
        }),
        meta: { correlationId: 'corr-abc' },
      }),
    );
    // Query string stripped from logged path
    expect(logger.error.mock.calls[0][0]).toEqual(
      expect.objectContaining({ path: '/auth/verify' }),
    );
  });

  it('maps ValidationPipe-style BadRequest to VALIDATION_ERROR', () => {
    const exception = new BadRequestException({
      message: ['walletAddress must be a string'],
      error: 'Bad Request',
      statusCode: 400,
    });

    filter.catch(exception, makeHost());

    const body = jsonSpy.mock.calls[0][0];
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('redacts sensitive details from the exception response', () => {
    const exception = new BadRequestException({
      message: 'validation failed',
      password: 'hunter2',
    });

    filter.catch(exception, makeHost());

    const body = jsonSpy.mock.calls[0][0];
    expect(body.error.details.password).toBe('[REDACTED]');
  });

  it('defaults to 500 INTERNAL_ERROR and notifies monitoring for non-HttpException', () => {
    filter.catch(new Error('boom'), makeHost());

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Internal server error',
          code: ErrorCode.INTERNAL_ERROR,
        }),
      }),
    );
    expect(logger.error).toHaveBeenCalled();
    expect(monitoring.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.INTERNAL_ERROR,
        status: 500,
        correlationId: 'corr-abc',
        path: '/auth/verify',
      }),
    );
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppLoggerService } from './app-logger.service';
import { ClsService } from 'nestjs-cls';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: { error: jest.Mock };
  let cls: { isActive: jest.Mock; getId: jest.Mock };
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  function makeHost(): ArgumentsHost {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    const res = { status: statusSpy };
    return {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    logger = { error: jest.fn() };
    cls = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('corr-abc'),
    };
    filter = new AllExceptionsFilter(
      logger as unknown as AppLoggerService,
      cls as unknown as ClsService,
    );
  });

  it('formats an HttpException using ApiResponseDto.fail with correlationId', () => {
    const exception = new BadRequestException('bad input');

    filter.catch(exception, makeHost());

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: 'bad input' }),
        meta: { correlationId: 'corr-abc' },
      }),
    );
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

  it('defaults to 500 for non-HttpException errors', () => {
    filter.catch(new Error('boom'), makeHost());

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: 'Internal server error' }),
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });
});

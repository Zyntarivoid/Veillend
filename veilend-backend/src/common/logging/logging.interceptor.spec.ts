/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { AppLoggerService } from './app-logger.service';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { log: jest.Mock; warn: jest.Mock };

  function makeContext(): ExecutionContext {
    const req = { method: 'GET', url: '/things?token=secret', originalUrl: '/things?token=secret' };
    const res = { statusCode: 200 };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    interceptor = new LoggingInterceptor(logger as unknown as AppLoggerService);
  });

  it('logs structured request entry and successful exit without query strings', (done) => {
    const context = makeContext();
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logger.log).toHaveBeenCalledTimes(2);
        expect(logger.log.mock.calls[0][0]).toEqual(
          expect.objectContaining({
            event: 'request_start',
            method: 'GET',
            path: '/things',
          }),
        );
        expect(logger.log.mock.calls[1][0]).toEqual(
          expect.objectContaining({
            event: 'request_end',
            statusCode: 200,
            path: '/things',
          }),
        );
        done();
      },
    });
  });

  it('logs a warning when the handler errors', (done) => {
    const context = makeContext();
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('fail')),
    };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0][0]).toEqual(
          expect.objectContaining({
            event: 'request_failed',
            method: 'GET',
            path: '/things',
          }),
        );
        done();
      },
    });
  });
});

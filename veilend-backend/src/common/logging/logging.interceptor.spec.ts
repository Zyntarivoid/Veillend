/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { ClsService } from 'nestjs-cls';
import { AppLoggerService } from './app-logger.service';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { log: jest.Mock; warn: jest.Mock; debug: jest.Mock };
  let cls: { isActive: jest.Mock; getId: jest.Mock };

  function makeContext(): ExecutionContext {
    const req = {
      method: 'GET',
      url: '/things',
      ip: '192.168.1.100',
      headers: {},
      user: { walletAddress: 'GBROWSERWALLET', sessionId: 'session-1' },
    };
    const res = { statusCode: 200 };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    cls = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('corr-123'),
    };
    interceptor = new LoggingInterceptor(
      logger as unknown as AppLoggerService,
      cls as unknown as ClsService,
    );
  });

  it('logs request entry and successful exit with masked IP', (done) => {
    const context = makeContext();
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_start',
            method: 'GET',
            url: '/things',
            ip: '192.168.1.0',
            correlationId: 'corr-123',
          }),
          'HTTP',
        );

        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(logger.log.mock.calls[0][0]).toEqual(
          expect.objectContaining({
            event: 'request_end',
            method: 'GET',
            url: '/things',
            statusCode: 200,
            ip: '192.168.1.0',
            correlationId: 'corr-123',
            walletAddress: 'GBROWSERWALLET',
            sessionId: 'session-1',
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
            event: 'request_end',
            method: 'GET',
            url: '/things',
            ip: '192.168.1.0',
            correlationId: 'corr-123',
          }),
        );
        done();
      },
    });
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { ClsService } from 'nestjs-cls';
import { AppLoggerService } from './app-logger.service';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { log: jest.Mock; warn: jest.Mock };
  let cls: { isActive: jest.Mock; getId: jest.Mock };

  function makeContext(): ExecutionContext {
    const req = {
      method: 'GET',
      url: '/things',
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
    logger = { log: jest.fn(), warn: jest.fn() };
    cls = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('corr-123'),
    };
    interceptor = new LoggingInterceptor(
      logger as unknown as AppLoggerService,
      cls as unknown as ClsService,
    );
  });

  it('logs request entry and successful exit', (done) => {
    const context = makeContext();
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(logger.log.mock.calls[0][0]).toEqual(
          expect.objectContaining({
            method: 'GET',
            url: '/things',
            statusCode: 200,
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
            method: 'GET',
            url: '/things',
            correlationId: 'corr-123',
            walletAddress: 'GBROWSERWALLET',
          }),
        );
        done();
      },
    });
  });
});

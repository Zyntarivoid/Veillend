/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { ClsService } from 'nestjs-cls';
import { AppLoggerService } from './app-logger.service';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { log: jest.Mock; warn: jest.Mock };
  let cls: { isActive: jest.Mock; getId: jest.Mock };

  function makeContext(ip = '192.168.1.42'): ExecutionContext {
    const req = {
      method: 'GET',
      url: '/things',
      ip,
      socket: { remoteAddress: ip },
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

  it('logs request_start and request_end with structured data', (done) => {
    const context = makeContext();
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logger.log).toHaveBeenCalledTimes(2);

        const startPayload = JSON.parse(logger.log.mock.calls[0][0]);
        expect(startPayload.event).toBe('request_start');
        expect(startPayload.method).toBe('GET');
        expect(startPayload.url).toBe('/things');
        expect(startPayload.ip).toBe('192.168.1.0'); // last octet zeroed

        const endPayload = JSON.parse(logger.log.mock.calls[1][0]);
        expect(endPayload.event).toBe('request_end');
        expect(endPayload.status_code).toBe(200);
        expect(typeof endPayload.duration_ms).toBe('number');

        done();
      },
    });
  });

  it('logs a warning with structured data when the handler errors', (done) => {
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
            sessionId: 'session-1',
          }),
        );

        done();
      },
    });
  });

  it('masks IPv4 last octet to zero', (done) => {
    const context = makeContext('10.0.0.55');
    const handler: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        const startPayload = JSON.parse(logger.log.mock.calls[0][0]);
        expect(startPayload.ip).toBe('10.0.0.0');

        done();
      },
    });
  });
});

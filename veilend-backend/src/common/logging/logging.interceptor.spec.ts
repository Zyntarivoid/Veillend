/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { AppLoggerService } from './app-logger.service';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { log: jest.Mock; warn: jest.Mock };

  function makeContext(ip = '192.168.1.42'): ExecutionContext {
    const req = {
      method: 'GET',
      url: '/things',
      ip,
      socket: { remoteAddress: ip },
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
    interceptor = new LoggingInterceptor(logger as unknown as AppLoggerService);
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
        const warnPayload = JSON.parse(logger.warn.mock.calls[0][0]);
        expect(warnPayload.event).toBe('request_end');
        expect(warnPayload.method).toBe('GET');
        expect(warnPayload.url).toBe('/things');
        expect(typeof warnPayload.duration_ms).toBe('number');
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

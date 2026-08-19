/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { AppLoggerService } from './app-logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;
  let cls: { isActive: jest.Mock; getId: jest.Mock };
  let writeSpy: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    process.env.NODE_ENV = 'development';
    cls = {
      isActive: jest.fn().mockReturnValue(true),
      getId: jest.fn().mockReturnValue('corr-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AppLoggerService, { provide: ClsService, useValue: cls }],
    }).compile();

    service = module.get(AppLoggerService);
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    writeSpy.mockRestore();
    jest.clearAllMocks();
  });

  function lastLine(): Record<string, unknown> {
    const raw = writeSpy.mock.calls[
      writeSpy.mock.calls.length - 1
    ][0] as string;
    return JSON.parse(raw);
  }

  it('emits a JSON line with correlationId, level and context', () => {
    service.log('hello', 'TestContext');

    const record = lastLine();
    expect(record).toMatchObject({
      level: 'log',
      context: 'TestContext',
      correlationId: 'corr-123',
      message: 'hello',
    });
    expect(typeof record.timestamp).toBe('string');
  });

  it('emits NDJSON formatted records in production environment (NODE_ENV=production)', () => {
    process.env.NODE_ENV = 'production';
    service.log('User signed in', 'AuthService');

    const record = lastLine();
    expect(record).toMatchObject({
      level: 'log',
      component: 'AuthService',
      context: 'AuthService',
      correlationId: 'corr-123',
      msg: 'User signed in',
    });
    expect(typeof record.time).toBe('string');
  });

  it('redacts object messages before serializing', () => {
    service.log({ password: 'hunter2', ok: true }, 'TestContext');

    const record = lastLine();
    expect(record.message).toEqual({ password: '[REDACTED]', ok: true });
  });

  it('redacts G-addresses and secret keys in string log messages', () => {
    service.warn(
      'Verify failed for GCKZ27M7C3VCWLNGMVIUCA5MNNJICYGKRPS75OZHNUCX33RTRJNQK6MH with seed SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH',
      'Security',
    );

    const record = lastLine();
    expect(record.message).toContain('GCKZ27...K6MH');
    expect(record.message).toContain('[REDACTED_SECRET_KEY]');
    expect(record.message).not.toContain(
      'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD4D876OQO7D6EUZPIF274IH',
    );
  });

  it('includes trace on error logs', () => {
    service.error('boom', 'stack-trace-here', 'TestContext');

    const record = lastLine();
    expect(record.level).toBe('error');
    expect(record.trace).toBe('stack-trace-here');
  });

  it('omits correlationId when no active CLS context', () => {
    cls.isActive.mockReturnValue(false);

    service.log('no context', 'TestContext');

    const record = lastLine();
    expect(record.correlationId).toBeUndefined();
  });
});

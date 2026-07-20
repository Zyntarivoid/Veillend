import { Injectable, LoggerService } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { redact } from './redact.util';

@Injectable()
export class AppLoggerService implements LoggerService {
  constructor(private readonly cls: ClsService) {}

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    trace?: string,
  ) {
    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;

    const record = {
      timestamp: new Date().toISOString(),
      level,
      context,
      correlationId,
      message: typeof message === 'string' ? message : redact(message),
      ...(trace ? { trace } : {}),
    };

    process.stdout.write(JSON.stringify(record) + '\n');
  }
}

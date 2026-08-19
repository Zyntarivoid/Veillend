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
    const isProd = process.env.NODE_ENV === 'production';
    const redactedMsg = redact(message);
    const now = new Date().toISOString();

    if (isProd) {
      // Production NDJSON schema optimized for Datadog/Loki/CloudWatch ingestion
      const prodRecord: Record<string, unknown> = {
        time: now,
        timestamp: now,
        level,
        msg:
          typeof redactedMsg === 'string'
            ? redactedMsg
            : JSON.stringify(redactedMsg),
        message: redactedMsg,
        component: context,
        context,
        correlationId,
        ...(trace ? { trace } : {}),
      };
      process.stdout.write(JSON.stringify(prodRecord) + '\n');
    } else {
      // Development format
      const record = {
        timestamp: now,
        level,
        context,
        correlationId,
        message: redactedMsg,
        ...(trace ? { trace } : {}),
      };
      process.stdout.write(JSON.stringify(record) + '\n');
    }
  }
}

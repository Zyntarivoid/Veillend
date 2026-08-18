import { Injectable, LoggerService } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { redact, redactString } from './redact.util';

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
    const isProd = process.env['NODE_ENV'] === 'production';

    // Resolve message: redact objects deeply, keep strings for final pass
    let resolvedMessage: unknown;
    if (typeof message === 'string') {
      resolvedMessage = message;
    } else {
      resolvedMessage = redact(message);
    }

    if (isProd) {
      // NDJSON format for Loki / Datadog ingestion
      const record: Record<string, unknown> = {
        level,
        time: new Date().toISOString(),
        msg: resolvedMessage,
        component: context,
        context,
        ...(correlationId ? { correlationId } : {}),
        ...(trace ? { trace } : {}),
      };

      // LAST step: apply PII regex redaction to the entire serialized line
      const line = JSON.stringify(record);
      process.stdout.write(redactString(line) + '\n');
    } else {
      // Pretty dev format
      const record = {
        timestamp: new Date().toISOString(),
        level,
        context,
        correlationId,
        message: resolvedMessage,
        ...(trace ? { trace } : {}),
      };

      // LAST step: apply PII regex redaction to the entire serialized line
      const line = JSON.stringify(record);
      process.stdout.write(redactString(line) + '\n');
    }
  }
}

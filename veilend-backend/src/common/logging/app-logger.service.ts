import { Injectable, LoggerService } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { redact, redactString } from './redact.util';

const IS_PROD = process.env['NODE_ENV'] === 'production';

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


    // Resolve message: redact objects deeply, keep strings for final pass
    let resolvedMessage: unknown;
    if (typeof message === 'string') {
      resolvedMessage = message;
    } else {
      resolvedMessage = redact(message);
    }

    if (IS_PROD) {
      // NDJSON format for Loki / Datadog ingestion
      const record: Record<string, unknown> = {
        level,
        time: new Date().toISOString(),
        msg: resolvedMessage,
        component: context,
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

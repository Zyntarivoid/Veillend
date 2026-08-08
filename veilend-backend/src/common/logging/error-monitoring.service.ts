import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ErrorMonitorEvent {
  level: 'error' | 'critical';
  code: string;
  message: string;
  status: number;
  correlationId?: string;
  path?: string;
  method?: string;
  /** Stack or redacted details — never include secrets */
  detail?: string;
}

/**
 * Optional outbound hook for critical errors (PagerDuty/Slack/webhook).
 * Disabled unless `ERROR_MONITORING_WEBHOOK` is set.
 *
 * Failures to deliver the hook are swallowed so monitoring never breaks requests.
 */
@Injectable()
export class ErrorMonitoringService {
  private readonly logger = new Logger(ErrorMonitoringService.name);
  private readonly webhookUrl: string | undefined;

  constructor(config: ConfigService) {
    const raw = config.get<string>('ERROR_MONITORING_WEBHOOK');
    this.webhookUrl = raw && raw.trim().length > 0 ? raw.trim() : undefined;
  }

  get enabled(): boolean {
    return !!this.webhookUrl;
  }

  /**
   * Fire-and-forget notification for server errors (status >= 500).
   */
  notify(event: ErrorMonitorEvent): void {
    if (!this.webhookUrl) {
      return;
    }

    const payload = {
      source: 'veilend-backend',
      ...event,
      timestamp: new Date().toISOString(),
    };

    void fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error monitoring webhook failed: ${msg}`);
    });
  }
}

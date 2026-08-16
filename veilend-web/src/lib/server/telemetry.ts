/**
 * Thin observability abstraction. Today it routes to console.*, but the
 * call sites are Sentry-ready: swap the bodies below for
 * `Sentry.captureException` / `Sentry.captureEvent` and nothing else
 * in the codebase has to change.
 */

export type TelemetryEvent = {
  kind: string;
  [key: string]: unknown;
};

export function captureException(err: unknown): void {
  // TODO(sentry): replace with Sentry.captureException(err)
  console.error('[telemetry:exception]', err);
}

export function captureEvent(event: TelemetryEvent): void {
  // TODO(sentry): replace with Sentry.captureMessage/captureEvent(event)
  console.info('[telemetry:event]', event);
}

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export type ErrorReportContext = {
  severity?: ErrorSeverity;
  area?: string;
  screen?: string;
  action?: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

export type ErrorReporter = (payload: ErrorReportPayload) => void | Promise<void>;

export type ErrorReportPayload = {
  message: string;
  name: string;
  severity: ErrorSeverity;
  stack?: string;
  context: {
    area?: string;
    screen?: string;
    action?: string;
    tags?: Record<string, string | number | boolean | null>;
    extra?: Record<string, unknown>;
  };
  timestamp: string;
};

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|secret|seed|mnemonic|private[_-]?key|token|authorization|cookie|session|jwt|api[_-]?key|email|phone|address)/i;
const REDACTED = '[redacted]';
let activeReporter: ErrorReporter | undefined;

export function setErrorReporter(reporter?: ErrorReporter) {
  activeReporter = reporter;
}

export function captureError(error: unknown, context: ErrorReportContext = {}) {
  const payload = buildErrorReport(error, context);

  if (activeReporter) {
    void activeReporter(payload);
    return payload;
  }

  if (isDevBuild()) {
    // Keep local debugging useful without sending sensitive data to a third party.
    console.warn('[error-reporting]', payload);
  }

  return payload;
}

export function buildErrorReport(
  error: unknown,
  context: ErrorReportContext = {},
  now: Date = new Date(),
): ErrorReportPayload {
  const normalized = normalizeError(error);

  return {
    message: sanitizeString(normalized.message),
    name: sanitizeString(normalized.name),
    severity: context.severity ?? 'error',
    stack: normalized.stack ? sanitizeStack(normalized.stack) : undefined,
    context: {
      area: context.area,
      screen: context.screen,
      action: context.action,
      tags: sanitizeTags(context.tags),
      extra: sanitizeObject(context.extra) as Record<string, unknown> | undefined,
    },
    timestamp: now.toISOString(),
  };
}

function isDevBuild() {
  return Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Non-error exception captured',
    name: 'Error',
    stack: undefined,
  };
}

function sanitizeTags(tags: ErrorReportContext['tags']) {
  if (!tags) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizePrimitive(value),
    ]),
  ) as Record<string, string | number | boolean | null>;
}

function sanitizeObject(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (depth >= 4) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeObject(item, depth + 1),
      ]),
    );
  }

  return String(value);
}

function sanitizePrimitive(value: string | number | boolean | null | undefined) {
  if (value == null) {
    return null;
  }

  return typeof value === 'string' ? sanitizeString(value) : value;
}

function sanitizeStack(stack: string) {
  return stack
    .split('\n')
    .slice(0, 12)
    .map((line) => sanitizeString(line))
    .join('\n');
}

function sanitizeString(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password|api[_-]?key)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/0x[a-fA-F0-9]{40}/g, '[redacted-address]')
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, '[redacted-secret]');
}

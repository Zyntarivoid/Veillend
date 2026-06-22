type ErrorSeverity = 'error' | 'fatal' | 'warning';

type ErrorContext = {
  metadata?: Record<string, unknown>;
  severity?: ErrorSeverity;
  source: string;
};

export type ErrorReport = {
  context: ErrorContext;
  message: string;
  name: string;
  stack?: string;
  timestamp: string;
};

type ErrorReporter = (report: ErrorReport) => void | Promise<void>;

type GlobalErrorUtils = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

const SENSITIVE_KEY_PATTERN = /(authorization|auth|jwt|mnemonic|password|private|secret|seed|signature|token)/i;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const STELLAR_KEY_PATTERN = /\b[SG][A-Z2-7]{55}\b/g;
const LONG_HEX_PATTERN = /\b0x[a-fA-F0-9]{32,}\b/g;
const MAX_STRING_LENGTH = 500;

let configuredReporter: ErrorReporter | null = null;
let globalHandlerInstalled = false;

export const configureErrorReporting = (reporter: ErrorReporter | null) => {
  configuredReporter = reporter;
};

const redactString = (value: string): string => {
  const redacted = value
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted]')
    .replace(STELLAR_KEY_PATTERN, '[stellar-key-redacted]')
    .replace(LONG_HEX_PATTERN, '[hex-redacted]');

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
};

export const sanitizeForReport = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForReport(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForReport(item, depth + 1);
      return acc;
    }, {});
  }

  return String(value);
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: redactString(error.message),
      name: error.name,
      stack: error.stack ? redactString(error.stack) : undefined,
    };
  }

  return {
    message: typeof error === 'string' ? redactString(error) : JSON.stringify(sanitizeForReport(error)),
    name: 'NonError',
    stack: undefined,
  };
};

export const reportError = (error: unknown, context: ErrorContext) => {
  const normalized = normalizeError(error);
  const report: ErrorReport = {
    context: sanitizeForReport(context) as ErrorContext,
    message: normalized.message,
    name: normalized.name,
    stack: normalized.stack,
    timestamp: new Date().toISOString(),
  };

  if (configuredReporter) {
    try {
      void Promise.resolve(configuredReporter(report)).catch(() => {});
    } catch (reportingError) {
      console.warn('Error reporter failed', normalizeError(reportingError));
    }
    return report;
  }

  if (__DEV__) {
    console.error('Captured VeilLend client error', report);
  }

  return report;
};

export const installGlobalErrorHandler = () => {
  if (globalHandlerInstalled) return;

  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();

  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    reportError(error, {
      severity: isFatal ? 'fatal' : 'error',
      source: 'global-js-handler',
    });
    previousHandler?.(error, isFatal);
  });

  globalHandlerInstalled = true;
};

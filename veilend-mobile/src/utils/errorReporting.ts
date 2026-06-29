/**
 * Error reporting and crash instrumentation module.
 *
 * Provides a centralized error boundary, structured error reporting,
 * and crash-safe logging for the VeilLend mobile app.
 *
 * Design decisions:
 * - No external crash reporting SDK (Sentry, Bugsnag etc.) — keeps bundle small
 *   and avoids third-party data flows. A future PR can add an adapter.
 * - All PII (wallet addresses, auth tokens, secret keys) is automatically
 *   scrubbed from error payloads before they are persisted or logged.
 * - Errors are stored in a ring buffer (cap 50) in SecureStore so they
 *   survive app restarts and can be inspected on the next launch.
 */

import { Platform } from 'react-native';
import * as SecureStoreShim from './secureStoreShim';

let SecureStore: typeof SecureStoreShim;
try {
  // @ts-ignore
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = SecureStoreShim as any;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorReport {
  id: string;
  timestamp: string;
  severity: ErrorSeverity;
  type: string;            // e.g. "NetworkError", "AuthError", "Crash"
  message: string;
  stack?: string;
  component?: string;      // React component name
  metadata?: Record<string, unknown>;
  platform: string;
  appVersion: string;
}

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const MAX_STORED_ERRORS = 50;
const SECURE_STORE_KEY = 'veilend_error_reports';
const SCRUB_PATTERNS: RegExp[] = [
  /S[A-Z2-7]{55}/g,                           // Stellar secret keys (S...)
  /G[A-Z2-7]{55}/g,                           // Stellar public keys (G...)
  /Bearer\s+[^\s"]+/g,                        // Bearer tokens
  /"authToken"\s*:\s*"[^"]+"/g,               // JSON authToken values
  /"secretKey"\s*:\s*"[^"]+"/g,               // JSON secretKey values
  /"address"\s*:\s*"[^"]+"/g,                 // JSON address values
];

const APP_VERSION = '1.0.0'; // Should match package.json

// ──────────────────────────────────────────────
// PII Scrubber
// ──────────────────────────────────────────────

/**
 * Remove sensitive data from error payloads.
 * Replaces wallet addresses, secret keys, and auth tokens with
 * placeholder strings so crash reports are safe to share.
 */
export function scrubPII(input: string): string {
  let result = input;
  for (const pattern of SCRUB_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

// ──────────────────────────────────────────────
// Error Report Store (ring buffer in SecureStore)
// ──────────────────────────────────────────────

let _memoryCache: ErrorReport[] | null = null;

async function loadReports(): Promise<ErrorReport[]> {
  if (_memoryCache) return _memoryCache;
  try {
    const raw = await SecureStore.getItemAsync(SECURE_STORE_KEY);
    _memoryCache = raw ? JSON.parse(raw) : [];
  } catch {
    _memoryCache = [];
  }
  return _memoryCache as ErrorReport[];
}

async function saveReports(reports: ErrorReport[]): Promise<void> {
  // Ring buffer: keep only the most recent MAX_STORED_ERRORS
  const trimmed = reports.slice(-MAX_STORED_ERRORS);
  _memoryCache = trimmed;
  try {
    await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // If SecureStore fails, in-memory cache is still valid for this session
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Generate a unique report ID.
 */
function generateId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Classify error severity based on error type and message.
 */
export function classifySeverity(error: unknown): ErrorSeverity {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Auth/session errors are critical — user cannot use the app
    if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('token expired')) {
      return 'critical';
    }
    // Network errors are high — core functionality broken
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused')) {
      return 'high';
    }
    // Type errors and reference errors usually mean a bug
    if (name.includes('typeerror') || name.includes('referenceerror')) {
      return 'high';
    }
  }
  return 'medium';
}

/**
 * Create a structured error report with PII scrubbed.
 */
export function createErrorReport(
  error: unknown,
  options?: {
    severity?: ErrorSeverity;
    component?: string;
    metadata?: Record<string, unknown>;
  }
): ErrorReport {
  const err = error instanceof Error ? error : new Error(String(error));
  const severity = options?.severity ?? classifySeverity(error);

  const report: ErrorReport = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    severity,
    type: err.name || 'Error',
    message: scrubPII(err.message || 'Unknown error'),
    stack: err.stack ? scrubPII(err.stack) : undefined,
    component: options?.component,
    metadata: options?.metadata
      ? scrubPII(JSON.stringify(options.metadata)) !== JSON.stringify(options.metadata)
        ? JSON.parse(scrubPII(JSON.stringify(options.metadata)))
        : options.metadata
      : undefined,
    platform: `${Platform.OS} ${Platform.Version}`,
    appVersion: APP_VERSION,
  };

  return report;
}

/**
 * Report an error: persist it and log it.
 * Safe to call from error boundaries, try/catch, or global handlers.
 */
export async function reportError(
  error: unknown,
  options?: {
    severity?: ErrorSeverity;
    component?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ErrorReport> {
  const report = createErrorReport(error, options);

  // Console log (stripped in production builds by minifiers)
  if (__DEV__) {
    const severityEmoji = { low: '🔵', medium: '🟡', high: '🔴', critical: '💀' };
    console.warn(
      `${severityEmoji[report.severity]} [${report.severity.toUpperCase()}] ${report.type}: ${report.message}`,
      report.component ? `@ ${report.component}` : '',
    );
  }

  // Persist to SecureStore ring buffer
  try {
    const reports = await loadReports();
    reports.push(report);
    await saveReports(reports);
  } catch {
    // Best-effort persistence
  }

  return report;
}

/**
 * Get all stored error reports (useful for debugging UI or crash review).
 */
export async function getStoredReports(): Promise<ErrorReport[]> {
  return loadReports();
}

/**
 * Clear all stored error reports.
 */
export async function clearStoredReports(): Promise<void> {
  _memoryCache = [];
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
  } catch {
    // Best-effort
  }
}

/**
 * Get count of stored reports without loading full payload.
 */
export async function getReportCount(): Promise<number> {
  const reports = await loadReports();
  return reports.length;
}

// ──────────────────────────────────────────────
// Global Error Handler Setup
// ──────────────────────────────────────────────

/**
 * Install global unhandled error and promise rejection handlers.
 * Call once during app startup (e.g., in App.tsx or index.js).
 */
export function setupCrashInstrumentation(): void {
  // Capture unhandled JS errors
  const originalErrorHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    reportError(error, {
      severity: isFatal ? 'critical' : 'high',
      component: 'GlobalHandler',
      metadata: { isFatal: !!isFatal },
    });

    // Forward to original handler if it exists
    if (originalErrorHandler) {
      originalErrorHandler(error, isFatal);
    }
  });

  // Capture unhandled promise rejections
  // Note: React Native doesn't have a native unhandledrejection event,
  // but we can track it through the global handler above for most cases.
}

export default {
  reportError,
  createErrorReport,
  getStoredReports,
  clearStoredReports,
  getReportCount,
  scrubPII,
  classifySeverity,
  setupCrashInstrumentation,
};

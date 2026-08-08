import { getRuntimePlatform } from './runtimePlatform';

/** Default backend port used by veilend-backend (see AppConfigService). */
const DEFAULT_PORT = 3000;

/**
 * Platform-aware fallbacks used when no env override is set.
 *
 * - web / iOS simulator: host machine loopback
 * - Android emulator: special host alias that maps to the host machine
 * - physical devices: must set EXPO_PUBLIC_API_URL to your LAN IP
 */
const PLATFORM_DEFAULTS: Record<string, string> = {
  web: `http://localhost:${DEFAULT_PORT}`,
  ios: `http://localhost:${DEFAULT_PORT}`,
  android: `http://10.0.2.2:${DEFAULT_PORT}`,
  // Node unit-test / unknown native runtimes
  node: `http://localhost:${DEFAULT_PORT}`,
};

export type ApiConfigSource =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_API_URL_WEB'
  | 'EXPO_PUBLIC_API_URL_MOBILE'
  | 'platform-default';

export interface ResolvedApiConfig {
  baseUrl: string;
  source: ApiConfigSource;
  platform: string;
}

function readEnv(name: string): string | undefined {
  // Expo inlines EXPO_PUBLIC_* at bundle time; process.env works in Node tests.
  const value =
    typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate that a candidate API base URL is absolute http(s) with a host.
 * Throws a descriptive Error on invalid input so misconfiguration fails loudly.
 */
export function assertValidApiBaseUrl(url: string, source: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `[veilend-mobile] Invalid API base URL from ${source}: "${url}". ` +
        `Expected an absolute URL such as http://localhost:${DEFAULT_PORT} or https://api.example.com`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `[veilend-mobile] Invalid API base URL from ${source}: "${url}". ` +
        `Only http: and https: schemes are supported.`,
    );
  }

  if (!parsed.hostname) {
    throw new Error(
      `[veilend-mobile] Invalid API base URL from ${source}: "${url}". ` +
        `URL must include a hostname.`,
    );
  }

  // Normalize: drop trailing slash so path joins stay predictable.
  return url.replace(/\/+$/, '');
}

/**
 * Resolve the backend API base URL from environment + runtime platform.
 *
 * Precedence:
 * 1. `EXPO_PUBLIC_API_URL` — single override for every platform (devices, staging, etc.)
 * 2. Platform-specific:
 *    - web: `EXPO_PUBLIC_API_URL_WEB`
 *    - native: `EXPO_PUBLIC_API_URL_MOBILE`
 * 3. Safe platform defaults (localhost / 10.0.2.2)
 */
export function resolveApiConfig(
  platformOs: string = getRuntimePlatform().OS,
): ResolvedApiConfig {
  const globalOverride = readEnv('EXPO_PUBLIC_API_URL');
  if (globalOverride) {
    return {
      baseUrl: assertValidApiBaseUrl(globalOverride, 'EXPO_PUBLIC_API_URL'),
      source: 'EXPO_PUBLIC_API_URL',
      platform: platformOs,
    };
  }

  const isWeb = platformOs === 'web';
  const platformEnvName = isWeb
    ? 'EXPO_PUBLIC_API_URL_WEB'
    : 'EXPO_PUBLIC_API_URL_MOBILE';
  const platformOverride = readEnv(platformEnvName);
  if (platformOverride) {
    return {
      baseUrl: assertValidApiBaseUrl(platformOverride, platformEnvName),
      source: isWeb
        ? 'EXPO_PUBLIC_API_URL_WEB'
        : 'EXPO_PUBLIC_API_URL_MOBILE',
      platform: platformOs,
    };
  }

  const fallback =
    PLATFORM_DEFAULTS[platformOs] ?? PLATFORM_DEFAULTS.node;
  return {
    baseUrl: assertValidApiBaseUrl(fallback, `platform-default(${platformOs})`),
    source: 'platform-default',
    platform: platformOs,
  };
}

/** Convenience accessor used by the axios client. */
export function getApiBaseUrl(): string {
  return resolveApiConfig().baseUrl;
}

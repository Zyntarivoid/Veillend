import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  assertValidApiBaseUrl,
  getApiBaseUrl,
  resolveApiConfig,
} from './config';

const ENV_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_API_URL_WEB',
  'EXPO_PUBLIC_API_URL_MOBILE',
] as const;

const originalEnv: Record<string, string | undefined> = {};

function clearApiEnv(): void {
  for (const key of ENV_KEYS) {
    if (!(key in originalEnv)) {
      originalEnv[key] = process.env[key];
    }
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = originalEnv[key];
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

describe('assertValidApiBaseUrl', () => {
  it('accepts absolute http URLs and strips trailing slashes', () => {
    assert.equal(
      assertValidApiBaseUrl('http://localhost:3000/', 'test'),
      'http://localhost:3000',
    );
  });

  it('rejects non-http schemes', () => {
    assert.throws(
      () => assertValidApiBaseUrl('ftp://example.com', 'test'),
      /Only http: and https:/,
    );
  });

  it('rejects relative or empty values', () => {
    assert.throws(
      () => assertValidApiBaseUrl('not-a-url', 'test'),
      /Invalid API base URL/,
    );
  });
});

describe('resolveApiConfig', () => {
  it('uses EXPO_PUBLIC_API_URL over platform defaults', () => {
    clearApiEnv();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.veillend.example';
    const resolved = resolveApiConfig('android');
    assert.equal(resolved.baseUrl, 'https://api.veillend.example');
    assert.equal(resolved.source, 'EXPO_PUBLIC_API_URL');
  });

  it('uses web-specific override on web', () => {
    clearApiEnv();
    process.env.EXPO_PUBLIC_API_URL_WEB = 'http://127.0.0.1:3000';
    process.env.EXPO_PUBLIC_API_URL_MOBILE = 'http://10.0.2.2:3000';
    const resolved = resolveApiConfig('web');
    assert.equal(resolved.baseUrl, 'http://127.0.0.1:3000');
    assert.equal(resolved.source, 'EXPO_PUBLIC_API_URL_WEB');
  });

  it('uses mobile-specific override on android', () => {
    clearApiEnv();
    process.env.EXPO_PUBLIC_API_URL_MOBILE = 'http://192.168.1.20:3000';
    const resolved = resolveApiConfig('android');
    assert.equal(resolved.baseUrl, 'http://192.168.1.20:3000');
    assert.equal(resolved.source, 'EXPO_PUBLIC_API_URL_MOBILE');
  });

  it('falls back to android emulator host by default', () => {
    clearApiEnv();
    const resolved = resolveApiConfig('android');
    assert.equal(resolved.baseUrl, 'http://10.0.2.2:3000');
    assert.equal(resolved.source, 'platform-default');
  });

  it('falls back to localhost for web by default', () => {
    clearApiEnv();
    const resolved = resolveApiConfig('web');
    assert.equal(resolved.baseUrl, 'http://localhost:3000');
    assert.equal(resolved.source, 'platform-default');
  });

  it('fails clearly when env override is malformed', () => {
    clearApiEnv();
    process.env.EXPO_PUBLIC_API_URL = '://bad';
    assert.throws(() => resolveApiConfig('web'), /Invalid API base URL/);
  });
});

describe('getApiBaseUrl', () => {
  it('returns a usable default URL in the test runtime', () => {
    clearApiEnv();
    const url = getApiBaseUrl();
    assert.match(url, /^https?:\/\//);
  });
});

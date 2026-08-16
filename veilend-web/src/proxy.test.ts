import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("Security Proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Landing page (/)", () => {
    it("sets required security headers in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const req = new NextRequest("http://localhost:3000/");
      const res = proxy(req);

      expect(res.headers.get("content-security-policy")).toBeTruthy();
      expect(res.headers.get("content-security-policy")).toContain(
        "frame-ancestors 'none'"
      );
      expect(res.headers.get("strict-transport-security")).toBeTruthy();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(res.headers.get("permissions-policy")).toBeTruthy();
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    });

    it("omits Strict-Transport-Security in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const req = new NextRequest("http://localhost:3000/");
      const res = proxy(req);

      expect(res.headers.get("strict-transport-security")).toBeNull();
      expect(res.headers.get("content-security-policy")).toContain(
        "unsafe-eval"
      );
    });
  });

  describe("Dashboard page (/dashboard)", () => {
    it("sets required security headers in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const req = new NextRequest("http://localhost:3000/dashboard");
      const res = proxy(req);

      expect(res.headers.get("content-security-policy")).toBeTruthy();
      expect(res.headers.get("strict-transport-security")).toBeTruthy();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });
  });

  it("generates a unique nonce per request", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req1 = new NextRequest("http://localhost:3000/");
    const req2 = new NextRequest("http://localhost:3000/");

    const csp1 = proxy(req1).headers.get("content-security-policy");
    const csp2 = proxy(req2).headers.get("content-security-policy");

    const nonce1 = csp1?.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = csp2?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { generateCsrfValue, signCsrfToken } from '@/lib/server/csrf';

function postRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/campaign-events', {
    method: 'POST',
    headers,
  });
}

describe('CSRF middleware', () => {
  it('returns 401 when the request has no CSRF cookie or header', async () => {
    const res = await proxy(postRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when the cookie is present but the header is missing', async () => {
    const signed = await signCsrfToken(generateCsrfValue());
    const res = await proxy(postRequest({ cookie: `csrf_token=${signed}` }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the header does not match the signed cookie', async () => {
    const signed = await signCsrfToken(generateCsrfValue());
    const res = await proxy(
      postRequest({ cookie: `csrf_token=${signed}`, 'x-csrf-token': 'not-the-right-token' })
    );
    expect(res.status).toBe(403);
  });

  it('allows the request through when the header matches the signed cookie', async () => {
    const signed = await signCsrfToken(generateCsrfValue());
    const res = await proxy(
      postRequest({ cookie: `csrf_token=${signed}`, 'x-csrf-token': signed })
    );
    expect(res.status).toBe(200);
  });

  it('does not gate GET requests, and bootstraps a csrf_token cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/campaign-events', { method: 'GET' });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.cookies.get('csrf_token')).toBeTruthy();
  });
});

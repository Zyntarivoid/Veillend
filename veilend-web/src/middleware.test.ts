import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("Security Middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Landing page (/)", () => {
    it("sets required security headers in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const req = new NextRequest("http://localhost:3000/");
      const res = middleware(req);

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
      const res = middleware(req);

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
      const res = middleware(req);

      expect(res.headers.get("content-security-policy")).toBeTruthy();
      expect(res.headers.get("strict-transport-security")).toBeTruthy();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });
  });

  it("generates a unique nonce per request", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req1 = new NextRequest("http://localhost:3000/");
    const req2 = new NextRequest("http://localhost:3000/");

    const csp1 = middleware(req1).headers.get("content-security-policy");
    const csp2 = middleware(req2).headers.get("content-security-policy");

    const nonce1 = csp1?.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = csp2?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });
});
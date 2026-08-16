import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || "";
  const sorobanUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "";

  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`
    : `script-src 'self' 'nonce-${nonce}' https: 'strict-dynamic'`;

  const styleSrc = isDev
    ? `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`
    : `style-src 'self' 'nonce-${nonce}'`;

  const cspDirectives = [
    `default-src 'self'`,
    scriptSrc,
    styleSrc,
    `img-src 'self' data: https:`,
    `connect-src 'self' ${apiUrl} ${horizonUrl} ${sorobanUrl}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ];

  if (!isDev) {
    cspDirectives.push("upgrade-insecure-requests");
  }

  const csp = cspDirectives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", csp);

  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfValue, signCsrfToken, verifyCsrfToken } from '@/lib/server/csrf';

export const config = {
  matcher: '/api/:path*',
};

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const existingCookie = request.cookies.get(CSRF_COOKIE)?.value;

  // Bootstrap a signed token for clients that don't have one yet so the
  // double-submit pattern has something to compare against next request.
  if (!existingCookie) {
    const signed = await signCsrfToken(generateCsrfValue());
    response.cookies.set(CSRF_COOKIE, signed, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  if (!WRITE_METHODS.has(request.method)) {
    return response;
  }

  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieToken = existingCookie;

  // Public GET-style opt-outs aren't relevant here since we already
  // returned above for non-write methods.
  if (!headerToken || !cookieToken) {
    return NextResponse.json({ error: 'Missing CSRF token' }, { status: 401 });
  }

  const cookieIsValid = await verifyCsrfToken(cookieToken);
  if (!cookieIsValid || headerToken !== cookieToken) {
    return NextResponse.json({ error: 'CSRF token mismatch' }, { status: 403 });
  }

  return response;
}

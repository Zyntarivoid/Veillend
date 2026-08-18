import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfValue, signCsrfToken, verifyCsrfToken } from '@/lib/server/csrf';

export const config = {
  matcher: [
    // Apply to all API routes (CSRF + header stripping)
    '/api/:path*',
    // Apply to dashboard routes and all non-static paths (header stripping only)
    '/dashboard/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export async function proxy(request: NextRequest) {
  // ── Strip client-supplied identity headers (defense against header spoofing) ─
  const requestHeaders = new Headers(request.headers);
  if (requestHeaders.has('x-wallet-address')) {
    requestHeaders.delete('x-wallet-address');
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // ── CSRF validation — API write methods only ──────────────────────────────────
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const existingCookie = request.cookies.get(CSRF_COOKIE)?.value;

  // Bootstrap a signed token for clients that don't have one yet so the
  // double-submit pattern has something to compare against next request.
  if (isApiRoute && !existingCookie) {
    const signed = await signCsrfToken(generateCsrfValue());
    response.cookies.set(CSRF_COOKIE, signed, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  if (!isApiRoute || !WRITE_METHODS.has(request.method)) {
    return response;
  }

  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieToken = existingCookie;

  if (!headerToken || !cookieToken) {
    return NextResponse.json({ error: 'Missing CSRF token' }, { status: 401 });
  }

  const cookieIsValid = await verifyCsrfToken(cookieToken);
  if (!cookieIsValid || headerToken !== cookieToken) {
    return NextResponse.json({ error: 'CSRF token mismatch' }, { status: 403 });
  }

  return response;
}

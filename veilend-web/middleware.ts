import { NextResponse, NextRequest } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const SESSION_COOKIE = 'veillend_session';
const MARKER_COOKIE = 'veillend_has_session';
const REFRESH_TTL_RATIO = 0.5; // refresh when >50% of TTL elapsed
const REFRESH_DEDUPE_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

// Simple in-memory dedupe by session jti or token fingerprint.
const lastRefreshAt = new Map<string, number>();

function parseJwt(token: string | undefined) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    let json = '';
    if (typeof globalThis.atob === 'function') {
      json = decodeURIComponent(Array.prototype.map.call(globalThis.atob(b64), function(c: string) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } else if (typeof Buffer !== 'undefined') {
      json = Buffer.from(b64, 'base64').toString('utf8');
    } else {
      return null;
    }
    const payload = JSON.parse(json);
    return payload;
  } catch (e) {
    return null;
  }
}

function isStaticRequest(path: string) {
  return path.startsWith('/_next') || path.startsWith('/images') || path === '/favicon.ico';
}

function sameOriginNext(nextParam: string | null) {
  if (!nextParam) return '/';
  try {
    const u = new URL(nextParam, SITE_URL);
    const allowed = new URL(SITE_URL);
    if (u.origin !== allowed.origin) return '/';
    return u.pathname + u.search;
  } catch (e) {
    return '/';
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  if (isStaticRequest(path)) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE)?.value;

  // Protected routes matchers are configured via `config` below,
  // but we still enforce auth when path matches those patterns.
  const protectedPrefix = path.startsWith('/dashboard') || path.startsWith('/api/dashboard') || path.startsWith('/api/actions');

  if (protectedPrefix && !session) {
    // No session
    if (req.method === 'GET') {
      const nextParam = url.pathname + url.search;
      const allowedNext = sameOriginNext(nextParam);
      const redirectTo = new URL(allowedNext, SITE_URL);
      redirectTo.searchParams.set('next', allowedNext);
      return NextResponse.redirect(redirectTo, 307);
    } else {
      return NextResponse.json({ code: 'UNAUTHENTICATED', loginUrl: '/login' }, { status: 401 });
    }
  }

  // If we have a session, consider refreshing it when >50% TTL elapsed
  if (session) {
    const payload = parseJwt(session);
    if (payload && payload.iat && payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      const ttl = payload.exp - payload.iat;
      const age = now - payload.iat;
      const ratio = ttl > 0 ? age / ttl : 1;

      // compute dedupe key
      const key = payload.jti || session.slice(0, 24);
      const last = lastRefreshAt.get(key) || 0;

      if (ratio > REFRESH_TTL_RATIO && Date.now() - last > REFRESH_DEDUPE_MS) {
        // attempt refresh
        try {
          lastRefreshAt.set(key, Date.now());
          const r = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session}`,
              'Content-Type': 'application/json',
            },
          });

          if (r.status === 200) {
            const data = await r.json();
            const newToken = data?.accessToken || data?.token || null;
            if (newToken) {
              const res = NextResponse.next();
              res.cookies.set({ name: SESSION_COOKIE, value: newToken, httpOnly: true, sameSite: 'lax', path: '/', maxAge: REFRESH_MAX_AGE });
              res.cookies.set({ name: MARKER_COOKIE, value: 'true', path: '/' });
              return res;
            }
          }

          if (r.status === 401) {
            // session invalid server-side
            const redirectTo = new URL('/login', SITE_URL);
            redirectTo.searchParams.set('reason', 'expired');
            const res = NextResponse.redirect(redirectTo);
            res.cookies.delete(SESSION_COOKIE);
            res.cookies.delete(MARKER_COOKIE);
            return res;
          }
        } catch (e) {
          // ignore refresh errors and proceed
          console.error('middleware refresh error', e);
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/api/dashboard/:path*', '/api/actions/:path*'],
};

import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Wrapper around fetch for server-side requests to the backend.
 * Automatically attaches the veillend_session token if present.
 * If backend returns 401, clear local session cookies so callers can redirect.
 */
export async function backendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('veillend_session');

  const headers = new Headers(options.headers);
  if (sessionCookie) {
    headers.set('Authorization', `Bearer ${sessionCookie.value}`);
  }

  // Ensure path starts with a slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Backend says session revoked/invalid. Clear cookies so browser/client will treat user as logged out.
    try {
      cookieStore.delete('veillend_session');
      cookieStore.delete('veillend_has_session');
    } catch (e) {
      // ignore
    }
  }

  return res;
}

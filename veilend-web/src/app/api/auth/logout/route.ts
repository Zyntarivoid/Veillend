import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get('veillend_session')?.value;

  // If we have a session, inform backend to revoke it server-side.
  if (session) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      // ignore backend errors, proceed to clear local cookies
      console.error('Error calling backend logout:', e);
    }
  }

  cookieStore.delete('veillend_session');
  cookieStore.delete('veillend_has_session');

  const redirectUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
  redirectUrl.pathname = '/login';
  redirectUrl.searchParams.set('loggedOut', '1');

  return NextResponse.redirect(redirectUrl);
}

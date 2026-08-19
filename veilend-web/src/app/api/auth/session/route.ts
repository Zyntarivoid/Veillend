import { NextResponse } from 'next/server';
import { fetchValidated } from '@/lib/api/validated-fetch';
import { backendFetch } from '@/lib/server/backendFetch';
import {
  AuthSessionResponseSchema,
  HttpError,
  ValidationError,
} from '@/lib/validation/api-schemas';

export async function GET() {
  try {
    const data = await fetchValidated('/auth/session', AuthSessionResponseSchema, {
      fetcher: (input, init) => backendFetch(String(input), init),
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) {
        // backend indicated session invalid; backendFetch already clears cookies.
        const redirectUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('reason', 'expired');
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.json({ error: 'Not authenticated' }, { status: error.status });
    }
    if (error instanceof ValidationError) {
      console.error('Session response validation error:', error);
      return NextResponse.json({ error: 'Invalid backend response' }, { status: 502 });
    }
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

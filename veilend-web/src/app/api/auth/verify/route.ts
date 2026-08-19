import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchValidated } from '@/lib/api/validated-fetch';
import { parseOr422 } from '@/lib/server/validation';
import { captureException } from '@/lib/server/telemetry';
import {
  AuthVerificationResponseSchema,
  AuthVerifyRequestSchema,
  HttpError,
  ValidationError,
  type AuthVerifyRequest,
} from '@/lib/validation/api-schemas';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    let parsed: { data: AuthVerifyRequest };
    try {
      parsed = await parseOr422(AuthVerifyRequestSchema, body);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }

    const { walletAddress, signature } = parsed.data;

    const cookieStore = await cookies();
    const nonceCookie = cookieStore.get(`nonce_${walletAddress}`);

    if (!nonceCookie || !nonceCookie.value) {
      return NextResponse.json({ error: 'Session challenge expired or invalid' }, { status: 400 });
    }

    const nonce = nonceCookie.value;

    const data = await fetchValidated(
      `${API_BASE_URL}/auth/verify`,
      AuthVerificationResponseSchema,
      {
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, nonce, signature }),
        },
      },
    );

    if (!data.accessToken) {
      return NextResponse.json({ error: 'Backend did not return an access token' }, { status: 502 });
    }

    // Set secure, HTTP-only session cookie
    cookieStore.set('veillend_session', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // maxAge: omitted, relies on session cookie or backend expiration logic
    });

    // Set non-HTTP-only marker for client-side state
    cookieStore.set('veillend_has_session', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    // Clear the nonce
    cookieStore.delete(`nonce_${walletAddress}`);

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: error.status },
      );
    }
    if (error instanceof ValidationError) {
      captureException(error);
      return NextResponse.json({ error: 'Invalid backend response' }, { status: 502 });
    }
    captureException(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

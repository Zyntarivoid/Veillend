import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchValidated } from '@/lib/api/validated-fetch';
import {
  AuthNonceRequestSchema,
  AuthNonceResponseSchema,
  HttpError,
  ValidationError,
} from '@/lib/validation/api-schemas';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(request: Request) {
  try {
    const parsedRequest = AuthNonceRequestSchema.safeParse(await request.json());
    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }
    const { walletAddress } = parsedRequest.data;

    const data = await fetchValidated(`${API_BASE_URL}/auth/nonce`, AuthNonceResponseSchema, {
      requestInit: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      },
    });

    const cookieStore = await cookies();
    // Temporarily store the nonce linked to the wallet address
    cookieStore.set(`nonce_${walletAddress}`, data.nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60, // 60 seconds
      path: '/',
    });

    return NextResponse.json({ nonce: data.nonce });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: 'Challenge request failed' }, { status: error.status });
    }
    if (error instanceof ValidationError) {
      console.error('Nonce response validation error:', error);
      return NextResponse.json({ error: 'Invalid backend response' }, { status: 502 });
    }
    console.error('Nonce error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

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

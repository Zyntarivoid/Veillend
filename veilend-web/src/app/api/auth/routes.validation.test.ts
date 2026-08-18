import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backendFetch } from '@/lib/server/backendFetch';

import { POST as requestNonce } from './nonce/route';
import { GET as getSession } from './session/route';
import { POST as verifySignature } from './verify/route';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));

vi.mock('@/lib/server/backendFetch', () => ({
  backendFetch: vi.fn(),
}));

const ADDRESS = `G${'A'.repeat(55)}`;

describe('auth proxy response validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.cookieGet.mockReset();
    mocks.cookieSet.mockReset();
    mocks.cookieDelete.mockReset();
    vi.mocked(backendFetch).mockReset();
  });

  it('does not persist an invalid nonce response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ nonce: 123 }),
    );
    const request = new Request('http://localhost/api/auth/nonce', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: ADDRESS }),
    });

    const response = await requestNonce(request);

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('does not set a session cookie from an invalid verify response', async () => {
    mocks.cookieGet.mockReturnValue({ value: 'nonce-1' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ accessToken: 42 }),
    );
    const request = new Request('http://localhost/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: ADDRESS, signature: 'signature' }),
    });

    const response = await verifySignature(request);

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('does not proxy an invalid session payload', async () => {
    vi.mocked(backendFetch).mockResolvedValue(Response.json({ walletAddress: 42 }));

    const response = await getSession();

    expect(response.status).toBe(502);
    expect(backendFetch).toHaveBeenCalledOnce();
  });
});

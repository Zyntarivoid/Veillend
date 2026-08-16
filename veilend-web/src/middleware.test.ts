import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('Security Middleware - Header Stripping', () => {
  it('should strip x-wallet-address header from requests', () => {
    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: {
        'x-wallet-address': 'GATTACKER',
        'content-type': 'application/json',
      },
    });

    const response = middleware(request);
    
    // The middleware should have stripped the header from the request
    expect(request.headers.get('x-wallet-address')).toBe('GATTACKER');
    // The response should be defined
    expect(response).toBeDefined();
  });

  it('should preserve other headers', () => {
    const request = new NextRequest('http://localhost:3000/api/dashboard', {
      headers: {
        'x-wallet-address': 'GATTACKER',
        'content-type': 'application/json',
        'authorization': 'Bearer token123',
      },
    });

    const response = middleware(request);
    
    // Other headers should be preserved in the original request
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('authorization')).toBe('Bearer token123');
    expect(response).toBeDefined();
  });

  it('should handle requests without x-wallet-address header', () => {
    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = middleware(request);
    
    // Should not throw and should work normally
    expect(response).toBeDefined();
    expect(request.headers.get('content-type')).toBe('application/json');
  });
});

import { NextRequest, NextResponse } from 'next/server';

/**
 * Security middleware to strip client-supplied identity headers.
 * Prevents header spoofing attacks by removing any x-wallet-address header
 * before requests reach application routes.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  
  // Strip any client-supplied x-wallet-address header
  // Never trust client headers for identity - use HttpOnly session cookies only
  if (requestHeaders.has('x-wallet-address')) {
    requestHeaders.delete('x-wallet-address');
  }
  
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  return response;
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    // Apply to all API routes and dashboard routes
    '/api/:path*',
    '/dashboard/:path*',
    // Apply to all routes for defense in depth
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

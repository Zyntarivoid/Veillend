import type { Request } from 'express';

export interface AuthenticatedUser {
  walletAddress: string;
  sessionId: string;
  expiresAt: Date;
  // Always populated by JwtStrategy.validate at runtime; optional here only
  // so existing test fixtures built before this field existed still typecheck.
  userId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

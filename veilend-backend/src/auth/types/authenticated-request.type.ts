import type { Request } from 'express';

export interface AuthenticatedUser {
  walletAddress: string;
  sessionId: string;
  expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

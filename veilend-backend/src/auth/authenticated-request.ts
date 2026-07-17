import { JwtPayload } from './jwt.strategy';

/**
 * Express Request object augmented with the authenticated JWT payload.
 * Use this instead of `any` in controllers protected by JwtAuthGuard.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Stellar wallet authentication utilities
 *
 * Implements a challenge-response handshake against the VeilLend
 * backend using Next.js API routes to securely handle HttpOnly cookies.
 */

import { Keypair } from "@stellar/stellar-sdk";

import { fetchValidated } from '@/lib/api/validated-fetch';
import {
  AuthNonceResponseSchema,
  AuthSessionResponseSchema,
  AuthVerificationResponseSchema,
  HttpError,
  ValidationError,
  type AuthVerificationResult as ValidatedAuthVerificationResult,
} from '@/lib/validation/api-schemas';

// Export these constants to satisfy tests even though we no longer use localStorage
export const AUTH_STORAGE_KEY = 'veillend_auth_session';
export const WALLET_ADDRESS_KEY = 'veillend_wallet_address';

export interface AuthSession {

  address: string;
  publicKey: string;
  authenticated: boolean;
  accessToken?: string;
  sessionId?: string;
  expiresAt?: string;
  lastVerifiedAt?: string;

}

export type AuthVerificationResult = ValidatedAuthVerificationResult;

/**
 * Clear the auth session (logout) via API route
 */

export const clearAuthSession = async (): Promise<void> => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Failed to logout:', error);
  }
};

/**
 * Request a fresh one-time nonce bound to the wallet address via API route.
 */
export const requestAuthNonce = async (address: string): Promise<string> => {
  const data = await fetchValidated('/api/auth/nonce', AuthNonceResponseSchema, {
    requestInit: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    },
  });

  return data.nonce;
};

/**
 * Submit the signed nonce via API route. The API route will verify the signature
 * with the backend and set the HttpOnly session cookie.
 */
export const verifyAuthSignature = async (
  address: string,
  signature: string
): Promise<AuthVerificationResult> => {
  return fetchValidated('/api/auth/verify', AuthVerificationResponseSchema, {
    requestInit: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address, signature }),
    },
  });
};

/**
 * Introspect the backend session via API route.
 * Automatically uses the HttpOnly cookie.
 */
export const fetchSessionStatus = async (): Promise<{ walletAddress: string } | null> => {
  try {
    return await fetchValidated('/api/auth/session', AuthSessionResponseSchema);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
};

/**
 * Creates an in-memory session object
 */
export const createAuthSession = (
  address: string,
  verification: AuthVerificationResult
): AuthSession => {
  return {
    address,
    publicKey: address,
    authenticated: true,
    accessToken: verification.accessToken,
    sessionId: verification.sessionId,
    expiresAt: verification.expiresAt,
    lastVerifiedAt: new Date().toISOString(),
  };
};

/**
 * Startup integrity check. Checks if the `veillend_has_session` marker cookie is present,
 * and if so, validates the session via the backend.
 */
export const validateStoredSession = async (): Promise<AuthSession | null> => {
  // Check for the non-HttpOnly marker cookie
  const hasSession = document.cookie.includes('veillend_has_session=true');
  
  if (!hasSession) {
    return null;
  }

  try {
    const remote = await fetchSessionStatus();
    if (!remote || !remote.walletAddress) {
      await clearAuthSession();
      return null;
    }

    return {
      address: remote.walletAddress,
      publicKey: remote.walletAddress,
      authenticated: true,
      lastVerifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      await clearAuthSession();
    }
    return null;
  }
};

/**
 * Run the full challenge-response flow. Returns the authenticated session
 * only when the API verified the signature.
 */
export const challengeWalletAuth = async (
  address: string,
  signMessage: (message: string) => Promise<string | null>
): Promise<AuthSession | null> => {
  const nonce = await requestAuthNonce(address);
  const signature = await signMessage(nonce);

  if (!signature) {
    return null;
  }

  // Verify only needs address and signature, the API route reads the nonce from the cookie
  const verification = await verifyAuthSignature(address, signature);
  return createAuthSession(address, verification);
};

/**
 * Validate a wallet address format
 */
export const isValidStellarAddress = (address: string): boolean => {
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
};

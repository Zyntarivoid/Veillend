/**
 * Stellar wallet authentication utilities
 *
 * Implements a real challenge-response handshake against the VeilLend
 * backend so localStorage sessions cannot be forged by page scripts:
 *
 *   1. POST /auth/nonce  -> backend issues a one-time random nonce
 *   2. wallet signs the nonce (SEP-53) via Freighter / Albedo / etc.
 *   3. POST /auth/verify -> backend verifies the Ed25519 signature and
 *      returns an access token; the backend is the authoritative verifier.
 *
 * Session keys are written to localStorage ONLY after step 3 succeeds, and
 * `validateStoredSession` reconciles any existing local record against the
 * backend session status on startup (auto-logout on disagreement).
 */

import { Keypair } from "@stellar/stellar-sdk";
import { fetchJson } from "@/lib/api/fetch-json";
import { HttpError } from "@/lib/api/errors";
import {
  authNonceResponseSchema,
  authSessionResponseSchema,
  authSessionStorageSchema,
  authVerifyResponseSchema,
  type AuthSession,
  type AuthVerifyResponse,
} from "@/lib/schemas/auth";

export const AUTH_STORAGE_KEY = "veillend_auth";
export const WALLET_ADDRESS_KEY = "veillend_wallet_address";

const DEFAULT_API_URL = "http://localhost:3001";

export type { AuthSession };
export type AuthVerificationResult = AuthVerifyResponse;

export const getApiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

const getStorage = (): Storage | null => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
};

const readSession = (storage: Storage): AuthSession | null => {
  const raw = storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = authSessionStorageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const writeSession = (storage: Storage, session: AuthSession): void => {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  storage.setItem(WALLET_ADDRESS_KEY, session.address);
};

/**
 * Clear the auth session (logout)
 */
export const clearAuthSession = (): void => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(AUTH_STORAGE_KEY);
  storage.removeItem(WALLET_ADDRESS_KEY);
};

/**
 * Request a fresh one-time nonce bound to the wallet address from the backend.
 */
export const requestAuthNonce = async (address: string): Promise<string> => {
  const data = await fetchJson(
    `${getApiBaseUrl()}/auth/nonce`,
    authNonceResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    }
  );

  return data.nonce;
};

/**
 * Submit the signed nonce to the backend. Only a positive response from the
 * backend authorizes the session.
 */
export const verifyAuthSignature = async (
  address: string,
  nonce: string,
  signature: string
): Promise<AuthVerificationResult> => {
  return fetchJson(
    `${getApiBaseUrl()}/auth/verify`,
    authVerifyResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address, nonce, signature }),
    }
  );
};

/**
 * Introspect the backend session for a token. Returns the authenticated
 * wallet context, or null when the token is invalid / revoked.
 */
export const fetchSessionStatus = async (
  accessToken: string
): Promise<{ walletAddress: string } | null> => {
  try {
    return await fetchJson(
      `${getApiBaseUrl()}/auth/session`,
      authSessionResponseSchema,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
};

/**
 * Persist a session locally. MUST only be called after the backend has
 * verified the signed challenge.
 */
export const createAuthSession = (
  address: string,
  verification: AuthVerificationResult
): AuthSession => {
  const session: AuthSession = {
    address,
    publicKey: address,
    authenticated: true,
    sessionId: verification.sessionId,
    accessToken: verification.accessToken,
    expiresAt: verification.expiresAt,
    lastVerifiedAt: new Date().toISOString(),
  };

  const storage = getStorage();
  if (storage) {
    writeSession(storage, session);
  }

  return session;
};

/**
 * Startup integrity check. Any localStorage record that lacks a verified
 * token, has expired, or disagrees with the backend session status is
 * cleared so the UI falls back to "disconnected".
 */
export const validateStoredSession = async (): Promise<AuthSession | null> => {
  const storage = getStorage();
  if (!storage) return null;

  const session = readSession(storage);
  if (!session) {
    // A stray wallet address without a verified session cannot be trusted.
    storage.removeItem(WALLET_ADDRESS_KEY);
    return null;
  }

  if (!session.authenticated || !session.accessToken) {
    clearAuthSession();
    return null;
  }

  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    clearAuthSession();
    return null;
  }

  try {
    const remote = await fetchSessionStatus(session.accessToken);
    if (!remote) {
      // Backend no longer recognises this session (revoked / forged).
      clearAuthSession();
      return null;
    }
    if (remote.walletAddress && remote.walletAddress !== session.address) {
      clearAuthSession();
      return null;
    }

    const refreshed: AuthSession = {
      ...session,
      lastVerifiedAt: new Date().toISOString(),
    };
    writeSession(storage, refreshed);
    return refreshed;
  } catch {
    // Backend unreachable: keep the local session, local expiry still applies.
    return session;
  }
};

/**
 * Run the full challenge-response flow. Returns the authenticated session
 * only when the backend verified the signature, otherwise null (e.g. the
 * wallet did not submit a signature) or rejects.
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

  const verification = await verifyAuthSignature(address, nonce, signature);
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

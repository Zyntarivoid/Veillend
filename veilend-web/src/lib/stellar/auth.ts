/**
 * Stellar wallet authentication utilities
 * Handles wallet-driven sign-in with signature verification
 */

import { Keypair } from "@stellar/stellar-sdk";
import { getNetworkPassphrase } from "./config";

const AUTH_STORAGE_KEY = "veillend_auth";
const WALLET_ADDRESS_KEY = "veillend_wallet_address";

export interface AuthSession {
  address: string;
  publicKey: string;
  authenticated: boolean;
  sessionId?: string;
  expiresAt?: string;
}

/**
 * Generate a challenge message for wallet authentication
 */
export const generateChallenge = (address: string): string => {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);
  return `VeilLend authentication\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
};

/**
 * Check if a wallet is authenticated
 */
export const isWalletAuthenticated = (): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!authData) return false;

    const session = JSON.parse(authData) as AuthSession;
    if (!session.authenticated) return false;

    // Check if session has expired
    if (session.expiresAt) {
      const expiresAt = new Date(session.expiresAt);
      if (expiresAt < new Date()) {
        // Session expired
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Get the authenticated wallet address
 */
export const getAuthenticatedWallet = (): string | null => {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(WALLET_ADDRESS_KEY);
  } catch {
    return null;
  }
};

/**
 * Create a new auth session
 */
export const createAuthSession = (address: string, publicKey: string): AuthSession => {
  const session: AuthSession = {
    address,
    publicKey,
    authenticated: true,
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `session_${Date.now()}_${Math.random()}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem(WALLET_ADDRESS_KEY, address);
  }

  return session;
};

/**
 * Clear the auth session (logout)
 */
export const clearAuthSession = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(WALLET_ADDRESS_KEY);
  }
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
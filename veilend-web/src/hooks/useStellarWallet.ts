"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  validateStoredSession,
  clearAuthSession,
  createAuthSession,
  requestAuthNonce,
  verifyAuthSignature,
  fetchSessionStatus,
} from "@/lib/stellar/auth";
import {
  connectFreighter,
  isFreighterInstalled,
  disconnectWallet,
  signMessage,
  getFreighterHealth,
} from "@/lib/stellar/wallet";

export type WalletHealthStatus =
  | "healthy"
  | "unavailable"
  | "address-rotated"
  | "session-expired";

export interface WalletState {
  address: string | null;
  publicKey: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isInstalled: boolean;
  isLoading: boolean;
  error: string | null;
  /** Current health of the active wallet/session, driven by the heartbeat. */
  healthStatus: WalletHealthStatus;
  /** Address Freighter currently reports when it disagrees with the session. */
  freighterAddress: string | null;
}

export interface WalletActions {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  /** Re-run the existing connection flow (used by the recovery banner). */
  reconnect: () => Promise<boolean>;
  /** Authorise the newly reported Freighter address via challenge-response. */
  switchToNewWallet: () => Promise<boolean>;
  /** Dismiss the rotation warning and keep the current authenticated session. */
  keepOldSession: () => void;
}

/** Heartbeat cadence for the wallet/session health check. */
export const WALLET_HEALTH_INTERVAL_MS = 30_000;

export function useStellarWallet(): WalletState & WalletActions {
  const [state, setState] = useState<WalletState>({
    address: null,
    publicKey: null,
    isConnected: false,
    isAuthenticated: false,
    isInstalled: false,
    isLoading: false,
    error: null,
    healthStatus: "healthy",
    freighterAddress: null,
  });

  // Latest-state ref so interval callbacks always observe current values
  // without tearing down/recreating timers on every render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // In-flight guards prevent concurrent heartbeat/connect/disconnect races.
  const healthCheckInFlightRef = useRef(false);
  const connectInFlightRef = useRef(false);
  // Address the user explicitly chose to ignore during a rotation warning.
  const suppressedRotationAddressRef = useRef<string | null>(null);

  // On mount: check Freighter installation and reconcile any stored session
  // against the backend. Forged / stale records are cleared (auto-logout).
  useEffect(() => {
    let cancelled = false;

    const initializeWallet = async () => {
      const installed = isFreighterInstalled();
      const session = await validateStoredSession();

      if (cancelled) return;

      setState((prev) => ({
        ...prev,
        isInstalled: installed,
        address: session?.address ?? null,
        publicKey: session?.publicKey ?? null,
        isConnected: session !== null,
        isAuthenticated: session !== null,
      }));
    };

    initializeWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (connectInFlightRef.current) return false;

    connectInFlightRef.current = true;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const wallet = await connectFreighter();

      // Challenge-response: only the backend can authorise the session.
      const nonce = await requestAuthNonce(wallet.address);
      const signature = await signMessage(nonce, wallet.publicKey);

      if (!signature) {
        throw new Error("Signature was not submitted; authentication cancelled.");
      }

      const verification = await verifyAuthSignature(
        wallet.address,
        signature
      );

      // Persist ONLY after the backend confirmed the signature.
      const session = createAuthSession(wallet.address, verification);

      // A successful (re)connect supersedes any prior health warning.
      suppressedRotationAddressRef.current = null;

      setState((prev) => ({
        ...prev,
        address: session.address,
        publicKey: session.publicKey,
        isConnected: true,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        healthStatus: "healthy",
        freighterAddress: null,
      }));

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        isConnected: false,
        isAuthenticated: false,
      }));

      return false;
    } finally {
      connectInFlightRef.current = false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet();
      await clearAuthSession();

      suppressedRotationAddressRef.current = null;

      setState((prev) => ({
        ...prev,
        address: null,
        publicKey: null,
        isConnected: false,
        isAuthenticated: false,
        error: null,
        healthStatus: "healthy",
        freighterAddress: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to disconnect wallet";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const reconnect = useCallback(() => connect(), [connect]);

  const switchToNewWallet = useCallback(() => connect(), [connect]);

  const keepOldSession = useCallback(() => {
    // Remember the address the user chose to ignore so the next heartbeat does
    // not re-flag the exact same wallet. A different address still re-warns.
    suppressedRotationAddressRef.current = stateRef.current.freighterAddress;
    setState((prev) => ({
      ...prev,
      healthStatus: "healthy",
      freighterAddress: null,
    }));
  }, []);

  const runHealthCheck = useCallback(async () => {
    const current = stateRef.current;

    // Only meaningful when the app believes a session is active.
    if (!current.isConnected || !current.isAuthenticated || !current.address) {
      return;
    }

    if (healthCheckInFlightRef.current || connectInFlightRef.current) return;

    healthCheckInFlightRef.current = true;

    try {
      // A/C: wallet availability + address rotation (no network traffic).
      const health = await getFreighterHealth();

      // Bail out if the user disconnected while we were probing.
      if (!stateRef.current.isConnected || stateRef.current.address !== current.address) {
        return;
      }

      if (!health.available || !health.address) {
        setState((prev) =>
          prev.healthStatus === "unavailable"
            ? prev
            : { ...prev, healthStatus: "unavailable" }
        );
        return;
      }

      if (health.address !== current.address) {
        if (suppressedRotationAddressRef.current === health.address) {
          // User chose to keep the old session for this wallet; stay healthy.
          return;
        }
        setState((prev) =>
          prev.healthStatus === "address-rotated" &&
          prev.freighterAddress === health.address
            ? prev
            : { ...prev, healthStatus: "address-rotated", freighterAddress: health.address }
        );
        return;
      }

      // B: server-side session expiry (only when the wallet itself is healthy,
      // to avoid needless API traffic while the wallet is unavailable).
      try {
        const remote = await fetchSessionStatus();

        if (!stateRef.current.isConnected || stateRef.current.address !== current.address) {
          return;
        }

        if (!remote || !remote.walletAddress) {
          // Backend no longer recognises the session: clear local state and
          // surface the recovery toast. Never leave a false "Connected" UI.
          await clearAuthSession();
          setState((prev) => ({
            ...prev,
            address: null,
            publicKey: null,
            isConnected: false,
            isAuthenticated: false,
            error: null,
            healthStatus: "session-expired",
            freighterAddress: null,
          }));
        } else {
          // Wallet is healthy and the backend still recognises the session —
          // clear any prior warning now that the app is consistent again.
          setState((prev) =>
            prev.healthStatus === "healthy"
              ? prev
              : { ...prev, healthStatus: "healthy" }
          );
        }
      } catch {
        // Transient network failure is not proof of expiry — keep current state.
      }
    } finally {
      healthCheckInFlightRef.current = false;
    }
  }, []);

  // Single heartbeat interval + opportunisitic checks when the tab regains
  // visibility or focus (covers returning after a long idle period).
  useEffect(() => {
    const intervalId = setInterval(() => {
      void runHealthCheck();
    }, WALLET_HEALTH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runHealthCheck();
      }
    };
    const onFocus = () => {
      void runHealthCheck();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [runHealthCheck]);

  return {
    ...state,
    connect,
    disconnect,
    clearError,
    reconnect,
    switchToNewWallet,
    keepOldSession,
  };
}

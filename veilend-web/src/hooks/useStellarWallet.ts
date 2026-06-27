"use client";

import { useState, useEffect, useCallback } from "react";
import { isWalletAuthenticated, getAuthenticatedWallet, clearAuthSession, createAuthSession } from "@/lib/stellar/auth";
import { connectFreighter, isFreighterInstalled, disconnectWallet } from "@/lib/stellar/wallet";

export interface WalletState {
  address: string | null;
  publicKey: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isInstalled: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export function useStellarWallet(): WalletState & WalletActions {
  const [state, setState] = useState<WalletState>({
    address: null,
    publicKey: null,
    isConnected: false,
    isAuthenticated: false,
    isInstalled: false,
    isLoading: false,
    error: null,
  });

  // Check authentication status and Freighter installation on mount
  useEffect(() => {
    const initializeWallet = () => {
      const installed = isFreighterInstalled();
      const isAuth = isWalletAuthenticated();
      const address = getAuthenticatedWallet();

      setState((prev) => ({
        ...prev,
        isInstalled: installed,
        address: isAuth ? address : null,
        publicKey: isAuth ? address : null,
        isConnected: isAuth && !!address,
        isAuthenticated: isAuth && !!address,
      }));
    };

    initializeWallet();
  }, []);

  const connect = useCallback(async () => {
    if (state.isLoading) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const wallet = await connectFreighter();

      // Create auth session
      createAuthSession(wallet.address, wallet.publicKey);

      setState((prev) => ({
        ...prev,
        address: wallet.address,
        publicKey: wallet.publicKey,
        isConnected: true,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        isConnected: false,
        isAuthenticated: false,
      }));
    }
  }, [state.isLoading]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet();
      clearAuthSession();

      setState((prev) => ({
        ...prev,
        address: null,
        publicKey: null,
        isConnected: false,
        isAuthenticated: false,
        error: null,
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

  return {
    ...state,
    connect,
    disconnect,
    clearError,
  };
}
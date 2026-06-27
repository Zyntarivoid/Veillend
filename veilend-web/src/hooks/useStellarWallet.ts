"use client";

import { useState, useEffect, useCallback } from "react";
import { isWalletAuthenticated, getAuthenticatedWallet, clearAuthSession } from "@/lib/stellar/auth";
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

  // Check if Freighter is installed
  useEffect(() => {
    const installed = isFreighterInstalled();
    setState((prev) => ({ ...prev, isInstalled: installed }));
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = isWalletAuthenticated();
      const address = getAuthenticatedWallet();

      if (isAuth && address) {
        setState((prev) => ({
          ...prev,
          address,
          publicKey: address,
          isConnected: true,
          isAuthenticated: true,
        }));
      }
    };

    checkAuth();
  }, []);

  const connect = useCallback(async () => {
    if (state.isLoading) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const wallet = await connectFreighter();

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
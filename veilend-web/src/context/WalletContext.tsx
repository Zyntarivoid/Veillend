"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useStellarWallet, WalletState, WalletActions } from "@/hooks/useStellarWallet";

type WalletContextType = WalletState & WalletActions;

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useStellarWallet();

  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

export default WalletProvider;
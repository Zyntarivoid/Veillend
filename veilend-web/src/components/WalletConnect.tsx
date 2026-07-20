"use client";

import React, { useEffect, useRef, useState } from "react";
import { Wallet, X, ExternalLink } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getWalletConnectionMessage, isFreighterInstalled } from "@/lib/stellar/wallet";

// Define the Freighter window interface
interface FreighterWindow extends Window {
  freighter?: {
    isConnected: () => Promise<{ isConnected: boolean }>;
    getAddress: () => Promise<{ address: string }>;
    signTransaction: (txXdr: string, opts?: { networkPassphrase?: string }) => Promise<{ signedTxXdr: string }>;
  };
}

interface WalletConnectProps {
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function WalletConnect({ className, size = "default" }: WalletConnectProps) {
  const { address, isConnected, isAuthenticated, isLoading, error, connect, disconnect, clearError } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsModalOpen(nextOpen);
    if (!nextOpen) {
      clearError();
    }
  };

  const handleConnect = async () => {
    const success = await connect();
    if (success) {
      setIsModalOpen(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setIsModalOpen(false);
    clearError();
  };

  const walletMessage = getWalletConnectionMessage(error, isFreighterInstalled());

  useEffect(() => {
    if (!isModalOpen) return;

    const focusTimer = window.setTimeout(() => {
      primaryActionRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [isModalOpen, error]);

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  // Wallet is connected
  if (isConnected && isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
          {truncatedAddress}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-slate-400 hover:text-slate-200"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  // Wallet not connected
  return (
    <>
      <Button
        variant="default"
        size={size}
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading}
        className={className}
      >
        <Wallet className="h-4 w-4 mr-2" />
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100"
          aria-describedby="wallet-connect-description"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-100">Connect Wallet</DialogTitle>
            <DialogDescription id="wallet-connect-description" className="text-slate-400">
              Connect your Stellar wallet to access the VeilLend dashboard and manage your shielded assets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Freighter Wallet Option */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xl">
                  🚀
                </div>
                <div>
                  <div className="font-medium text-slate-200">Freighter Wallet</div>
                  <div className="text-xs text-slate-500">Stellar browser extension</div>
                </div>
              </div>
              <Button
                ref={primaryActionRef}
                variant="default"
                size="sm"
                onClick={handleConnect}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {isLoading ? "Connecting..." : error ? walletMessage.primaryAction : "Connect"}
              </Button>
            </div>

            {(error || !isFreighterInstalled()) && (
              <div
                className={`rounded-xl border p-3 text-sm ${error ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}
                role="alert"
                aria-live="polite"
              >
                <p className="font-medium">{walletMessage.title}</p>
                <p className="mt-1 text-sm/6">
                  {walletMessage.description}
                </p>
                {error && (
                  <p className="mt-2 font-mono text-xs opacity-80">{error}</p>
                )}
              </div>
            )}

            {/* Recovery actions */}
            {(error || !isFreighterInstalled()) && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {isLoading ? "Connecting..." : walletMessage.primaryAction}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {walletMessage.secondaryAction}
                </Button>
              </div>
            )}

            {/* Info Message */}
            {!isFreighterInstalled() && !error && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-400">
                <p className="flex items-center gap-2">
                  <span>Freighter wallet not detected.</span>
                  <a
                    href="https://www.freighter.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    Install Freighter <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <p className="text-xs text-slate-500">
              By connecting, you agree to the VeilLend Terms of Service.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export default WalletConnect;
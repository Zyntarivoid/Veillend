"use client";

import React, { useState } from "react";
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
  const { address, isConnected, isAuthenticated, isLoading, error, connect, disconnect } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleConnect = async () => {
    await connect();
    if (!error) {
      setIsModalOpen(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setIsModalOpen(false);
  };

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

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-100">Connect Wallet</DialogTitle>
            <DialogDescription className="text-slate-400">
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
                variant="default"
                size="sm"
                onClick={handleConnect}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                {isLoading ? "Connecting..." : "Connect"}
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Info Message */}
            {!isFreighterInstalled() && (
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
              onClick={() => setIsModalOpen(false)}
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

/**
 * Helper function to check if Freighter is installed
 * This is exported for use in other components
 */
export const isFreighterInstalled = (): boolean => {
  if (typeof window === "undefined") return false;
  const win = window as FreighterWindow;
  return typeof win.freighter !== "undefined";
};

export default WalletConnect;
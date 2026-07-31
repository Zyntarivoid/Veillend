"use client";

import React, { useEffect, useRef, useState } from "react";
import { Wallet, X, ExternalLink, Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
// import { Flex } from "@/components/Layout";
import { getWalletConnectionMessage, isFreighterInstalled } from "@/lib/stellar/wallet";

interface WalletConnectProps {
  variant?: 'default' | 'compact' | 'full';
  className?: string;
  size?: "sm" | "default" | "lg";
  onSuccess?: (address: string) => void;
  onError?: (error: Error) => void;
}

export function WalletConnect({ 
  variant = 'default',
  className = "",
  size = "default",
  onSuccess,
  onError
}: WalletConnectProps) {
  const { 
    address, 
    isConnected, 
    isAuthenticated, 
    isInstalled, 
    isLoading, 
    error,
    connect,
    disconnect,
    clearError 
  } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsModalOpen(nextOpen);
    if (!nextOpen) {
      clearError();
    }
  };

  const handleConnect = async () => {
    if (isConnecting || isLoading) return;

    try {
      setIsConnecting(true);
      clearError();

      const success = await connect();
      
      if (success && address && onSuccess) {
        onSuccess(address);
      }
      
      if (success) {
        setIsModalOpen(false);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to connect wallet');
      if (onError) {
        onError(errorObj);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setIsModalOpen(false);
      clearError();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  const walletMessage = getWalletConnectionMessage(error, isFreighterInstalled());
  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  // Focus management
  useEffect(() => {
    if (!isModalOpen) return;

    const focusTimer = window.setTimeout(() => {
      primaryActionRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [isModalOpen, error]);

  // Compact variant - minimal display
  if (variant === 'compact') {
    if (isConnected && isAuthenticated && address) {
      return (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-md">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-slate-200">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            className="text-xs text-slate-400 hover:text-red-400"
          >
            Disconnect
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="default"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading || isConnecting}
        className={className}
      >
        {isLoading || isConnecting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4 mr-2" />
        )}
        {isLoading || isConnecting ? "Connecting..." : "Connect"}
      </Button>
    );
  }

  // Full variant - with extra description
  if (variant === 'full') {
    return (
      <div className="w-full space-y-4">
        {isConnected && isAuthenticated && address ? (
          <div className="flex items-center justify-between p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">Connected</div>
                <div className="text-xs text-slate-400">
                  {address.slice(0, 6)}...{address.slice(-6)}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="text-xs border-slate-700 hover:border-red-500/50 hover:text-red-400"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <>
            <Button
              onClick={() => setIsModalOpen(true)}
              disabled={isLoading || isConnecting}
              className="w-full flex items-center justify-center gap-2 py-6 text-base"
              size="lg"
            >
              {isLoading || isConnecting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Wallet className="h-5 w-5" />
              )}
              {isLoading || isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>
            <p className="text-xs text-slate-400 text-center">
              Connect your Stellar wallet to access the dashboard
            </p>
          </>
        )}
      </div>
    );
  }

  // Default variant - connected state
  if (isConnected && isAuthenticated && address) {
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

  // Default variant - disconnected state
  return (
    <>
      <Button
        variant="default"
        size={size}
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading || isConnecting}
        className={className}
      >
        {isLoading || isConnecting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4 mr-2" />
        )}
        {isLoading || isConnecting ? "Connecting..." : "Connect Wallet"}
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
            {/* Error state inside modal */}
            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

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
                disabled={isLoading || isConnecting || !isInstalled}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {isLoading || isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : error ? (
                  "Retry"
                ) : isInstalled ? (
                  "Connect"
                ) : (
                  "Install"
                )}
              </Button>
            </div>

            {/* Wallet status messages */}
            {(!isInstalled || error) && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  error 
                    ? "bg-red-500/10 border-red-500/20 text-red-400" 
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                }`}
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
            {(error || !isInstalled) && (
              <div className="flex flex-wrap gap-2">
                {!isInstalled && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => window.open('https://www.freighter.app/', '_blank')}
                    className="bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Install Freighter
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {error ? "Dismiss" : "Cancel"}
                </Button>
              </div>
            )}

            {/* Install prompt */}
            {!isInstalled && !error && (
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
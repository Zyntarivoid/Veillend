"use client";

import React from "react";
import { Wallet, ShieldCheck, ShieldAlert, Loader2, XCircle } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WalletStatusProps {
  showDetails?: boolean;
  className?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function WalletStatus({ 
  showDetails = false, 
  className = "",
  onConnect,
  onDisconnect
}: WalletStatusProps) {
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

  const handleConnect = async () => {
    if (onConnect) {
      onConnect();
    }
    await connect();
  };

  const handleDisconnect = async () => {
    if (onDisconnect) {
      onDisconnect();
    }
    await disconnect();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-slate-400 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  // Error state with tooltip
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20">
          Error
        </Badge>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-red-400/70 cursor-help max-w-[100px] truncate">
                {error}
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900 border-slate-800">
              <p className="text-xs text-slate-300 max-w-xs">{error}</p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 text-xs text-slate-400 hover:text-slate-200 h-auto px-2 py-1"
                onClick={clearError}
              >
                Dismiss
              </Button>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Freighter not installed
  if (!isInstalled) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <XCircle className="h-4 w-4 text-amber-400" />
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
          Freighter Required
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="text-xs border-slate-700 hover:bg-slate-800 text-slate-300 h-7 px-2"
          onClick={() => window.open('https://www.freighter.app/', '_blank')}
        >
          Install
        </Button>
      </div>
    );
  }

  // Connected state
  if (isConnected && isAuthenticated) {
    const truncatedAddress = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "";

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          Connected
        </Badge>
        {showDetails && address && (
          <span className="text-sm font-mono text-slate-300">{truncatedAddress}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-xs text-slate-500 hover:text-red-400 h-6 px-2 -ml-1"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  // Disconnected state
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Wallet className="h-4 w-4 text-slate-500" />
      <span className="text-sm text-slate-400">Not connected</span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnect}
        className="text-xs border-slate-700 hover:bg-slate-800 text-slate-300 h-7 px-3"
      >
        Connect
      </Button>
    </div>
  );
}

export default WalletStatus;
"use client";

import React from "react";
import { Wallet, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Badge } from "@/components/ui/badge";

interface WalletStatusProps {
  showDetails?: boolean;
  className?: string;
}

export function WalletStatus({ showDetails = false, className = "" }: WalletStatusProps) {
  const { address, isConnected, isAuthenticated, isLoading, error } = useWallet();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-slate-400 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Initializing wallet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-red-400 ${className}`}>
        <ShieldAlert className="h-4 w-4" />
        <span className="text-sm">Wallet error</span>
        {showDetails && <span className="text-xs text-red-400/70">{error}</span>}
      </div>
    );
  }

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
        {showDetails && (
          <span className="text-sm font-mono text-slate-300">{truncatedAddress}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-slate-500 ${className}`}>
      <Wallet className="h-4 w-4" />
      <span className="text-sm">Not connected</span>
    </div>
  );
}

export default WalletStatus;
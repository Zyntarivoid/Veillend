"use client";

import React from "react";
import { AlertCircle, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";

/**
 * Global wallet/session health surface.
 *
 * Renders the appropriate recovery UI for the three stale-session conditions
 * detected by the `useStellarWallet` heartbeat:
 *   - wallet unavailable / locked / address missing -> inline warning + reconnect
 *   - server session expired                        -> toast + reconnect
 *   - wallet address rotation                       -> switch / keep choices
 *
 * It returns null while healthy so no announcement is ever repeated; the
 * banner/toast is mounted once per state transition.
 */
export function WalletSessionAlert() {
  const {
    healthStatus,
    freighterAddress,
    reconnect,
    switchToNewWallet,
    keepOldSession,
  } = useWallet();

  if (healthStatus === "healthy") {
    return null;
  }

  if (healthStatus === "session-expired") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed inset-x-0 top-4 z-[100] flex justify-center px-4"
      >
        <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-red-500/30 bg-slate-950/95 p-4 text-sm text-slate-100 shadow-xl backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <p>Session expired. Please reconnect.</p>
          </div>
          <Button
            size="sm"
            onClick={() => void reconnect()}
            className="shrink-0 gap-1.5 bg-red-500/90 hover:bg-red-500 text-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reconnect
          </Button>
        </div>
      </div>
    );
  }

  if (healthStatus === "unavailable") {
    return (
      <div
        role="alert"
        className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <p>Wallet unavailable — please unlock Freighter and reconnect</p>
          </div>
          <Button
            size="sm"
            onClick={() => void reconnect()}
            className="shrink-0 gap-1.5"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reconnect
          </Button>
        </div>
      </div>
    );
  }

  // address-rotated
  return (
    <div
      role="alert"
      className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <p>
            Freighter is reporting a different wallet address
            {freighterAddress ? (
              <span className="ml-1 font-mono text-red-100">
                ({freighterAddress.slice(0, 6)}…{freighterAddress.slice(-4)})
              </span>
            ) : null}
            . Your session is still linked to the previous wallet.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => void switchToNewWallet()}
            className="gap-1.5"
          >
            Switch to new wallet
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={keepOldSession}
            className="gap-1.5"
          >
            Keep old session
          </Button>
        </div>
      </div>
    </div>
  );
}

export default WalletSessionAlert;

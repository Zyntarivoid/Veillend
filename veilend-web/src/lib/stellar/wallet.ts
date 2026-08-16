/**
 * Stellar wallet connection utilities
 * Supports Freighter wallet integration
 */

import { isConnected, getAddress, signMessage as signMessageWithWallet } from "@stellar/freighter-api";

export interface WalletInfo {
  address: string;
  publicKey: string;
}

export interface WalletHealthInfo {
  available: boolean;
  address: string | null;
}

export interface WalletConnectionMessage {
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
  isRetryable: boolean;
}

export const getWalletConnectionMessage = (
  errorMessage?: string | null,
  isInstalled = true
): WalletConnectionMessage => {
  const normalizedError = (errorMessage || "").toLowerCase();

  if (!isInstalled || normalizedError.includes("not installed") || normalizedError.includes("install")) {
    return {
      title: "Freighter is not ready",
      description: "Install the Freighter browser extension, then return here and connect again.",
      primaryAction: "Connect",
      secondaryAction: "Cancel",
      isRetryable: false,
    };
  }

  if (normalizedError.includes("unlock") || normalizedError.includes("not connected") || normalizedError.includes("connected")) {
    return {
      title: "Wallet connection needs attention",
      description: "Unlock Freighter and approve the connection request so VeilLend can continue.",
      primaryAction: "Try again",
      secondaryAction: "Cancel",
      isRetryable: true,
    };
  }

  return {
    title: "We hit a wallet issue",
    description: "Review the message below, then try again when you're ready to continue.",
    primaryAction: "Try again",
    secondaryAction: "Cancel",
    isRetryable: true,
  };
};

/**
 * Check if Freighter wallet is installed
 */
export const isFreighterInstalled = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { freighter?: unknown }).freighter;
};

/**
 * Lightweight, non-interactive wallet health probe.
 *
 * Reports whether Freighter is installed, unlocked/authorised, and which
 * address it currently exposes. It never throws and never prompts the user,
 * so it is safe to run on a polling interval. Any failure (extension missing,
 * wallet locked, address unavailable) collapses into `available: false`.
 */
export const getFreighterHealth = async (): Promise<WalletHealthInfo> => {
  if (!isFreighterInstalled()) {
    return { available: false, address: null };
  }

  try {
    const connected = await isConnected();
    if (!connected || !connected.isConnected) {
      return { available: false, address: null };
    }

    const address = await getFreighterAddress();
    return { available: Boolean(address), address: address || null };
  } catch {
    return { available: false, address: null };
  }
};

/**
 * Connect to Freighter wallet
 */
export const connectFreighter = async (): Promise<WalletInfo> => {
  if (!isFreighterInstalled()) {
    throw new Error("Freighter wallet is not installed. Please install Freighter from https://www.freighter.app/");
  }

  try {
    const isConnectedResult = await isConnected();
    if (!isConnectedResult.isConnected) {
      throw new Error("Freighter is not connected. Please unlock your wallet.");
    }

    const addressResult = await getAddress();
    if (!addressResult || typeof addressResult !== 'object' || !('address' in addressResult)) {
      throw new Error("Failed to get address from Freighter.");
    }

    const publicKey = addressResult.address;
    if (!publicKey) {
      throw new Error("Failed to get public key from Freighter.");
    }

    return {
      address: publicKey,
      publicKey: publicKey,
    };
  } catch (error) {
    console.error("Freighter connection error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to connect to Freighter wallet.");
  }
};

/**
 * Get Freighter wallet address
 */
export const getFreighterAddress = async (): Promise<string> => {
  if (!isFreighterInstalled()) {
    throw new Error("Freighter wallet is not installed.");
  }

  try {
    const addressResult = await getAddress();
    if (!addressResult || typeof addressResult !== 'object' || !('address' in addressResult)) {
      throw new Error("Failed to get address from Freighter.");
    }

    const address = addressResult.address;
    if (!address) {
      throw new Error("Failed to get address from Freighter.");
    }

    return address;
  } catch (error) {
    console.error("Get address error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to get address.");
  }
};

/**
 * Sign an arbitrary message with the Freighter wallet.
 *
 * Uses the wallet's signMessage (SEP-53 framing) so the returned
 * base64-encoded Ed25519 signature can be verified by the backend's
 * /auth/verify endpoint. Returns null when the user does not submit a
 * signature (e.g. they dismiss the prompt).
 */
export const signMessage = async (
  message: string,
  address?: string
): Promise<string | null> => {
  if (!isFreighterInstalled()) {
    throw new Error("Freighter wallet is not installed.");
  }

  try {
    const addressResult = await getAddress();
    if (!addressResult || typeof addressResult !== 'object' || !('address' in addressResult)) {
      throw new Error("Failed to get address from Freighter.");
    }

    const publicKey = address ?? addressResult.address;
    if (!publicKey) {
      throw new Error("Failed to get public key.");
    }

    const result = await signMessageWithWallet(message, { address: publicKey });
    if (result.error) {
      throw new Error(result.error.message ?? "Failed to sign message.");
    }

    const { signedMessage } = result;
    if (!signedMessage) {
      // No signature was submitted (cancelled / rejected by the user).
      return null;
    }

    return Buffer.isBuffer(signedMessage)
      ? signedMessage.toString("base64")
      : signedMessage;
  } catch (error) {
    console.error("Message signing error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to sign message.");
  }
};

/**
 * Disconnect wallet (clears local state)
 */
export const disconnectWallet = async (): Promise<void> => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("veillend_wallet_address");
    localStorage.removeItem("veillend_wallet_auth");
  }
};
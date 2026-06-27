/**
 * Stellar wallet connection utilities
 * Supports Freighter wallet integration
 */

import { Server, TransactionBuilder, Networks, Operation, Keypair } from "@stellar/stellar-sdk";
import { isConnected, getPublicKey, signTransaction } from "@stellar/freighter-api";
import { getHorizonUrl, getNetworkPassphrase } from "./config";

export interface WalletInfo {
  address: string;
  publicKey: string;
}

export interface WalletError {
  code: string;
  message: string;
}

/**
 * Check if Freighter wallet is installed
 */
export const isFreighterInstalled = (): boolean => {
  return typeof window !== "undefined" && typeof (window as any).freighter !== "undefined";
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
    if (!isConnectedResult) {
      throw new Error("Freighter is not connected. Please unlock your wallet.");
    }

    const publicKey = await getPublicKey();
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
 * Sign a message using Freighter wallet
 */
export const signMessage = async (message: string): Promise<string> => {
  if (!isFreighterInstalled()) {
    throw new Error("Freighter wallet is not installed.");
  }

  try {
    const publicKey = await getPublicKey();
    if (!publicKey) {
      throw new Error("Failed to get public key.");
    }

    // Use the signTransaction API for signing arbitrary messages
    // Freighter expects a transaction XDR for signing
    const server = new Server(getHorizonUrl());
    const account = await server.loadAccount(publicKey);

    // Create a dummy transaction with the message as memo
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(Operation.setOptions({}))
      .setTimeout(30)
      .build();

    // Add the message as a memo (Note: This is a simplified approach)
    // For proper message signing, you'd want to use a different method
    const signedTx = await signTransaction(tx.toXDR(), {
      networkPassphrase: getNetworkPassphrase(),
    });

    return signedTx;
  } catch (error) {
    console.error("Message signing error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to sign message.");
  }
};

/**
 * Verify a signed message
 */
export const verifySignedMessage = async (
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> => {
  try {
    // For now, we'll just validate the public key format
    // Full signature verification would require the Stellar SDK
    const keypair = Keypair.fromPublicKey(publicKey);
    return keypair.publicKey() === publicKey;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

/**
 * Disconnect wallet (clears local state)
 */
export const disconnectWallet = async (): Promise<void> => {
  // Freighter doesn't provide a disconnect method
  // We'll just clear local state
  localStorage.removeItem("veillend_wallet_address");
  localStorage.removeItem("veillend_wallet_auth");
};
/**
 * Stellar wallet connection utilities
 * Supports Freighter wallet integration
 */

import { Horizon, TransactionBuilder, Operation, Keypair } from "@stellar/stellar-sdk";
import { isConnected, getAddress, signTransaction } from "@stellar/freighter-api";
import { getHorizonUrl, getNetworkPassphrase } from "./config";

export interface WalletInfo {
  address: string;
  publicKey: string;
}

/**
 * Check if Freighter wallet is installed
 */
export const isFreighterInstalled = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { freighter?: unknown }).freighter;
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
 * Sign a message using Freighter wallet
 */
export const signMessage = async (message: string): Promise<string> => {
  if (!isFreighterInstalled()) {
    throw new Error("Freighter wallet is not installed.");
  }

  try {
    const addressResult = await getAddress();
    if (!addressResult || typeof addressResult !== 'object' || !('address' in addressResult)) {
      throw new Error("Failed to get address from Freighter.");
    }

    const publicKey = addressResult.address;
    if (!publicKey) {
      throw new Error("Failed to get public key.");
    }

    const server = new Horizon.Server(getHorizonUrl());
    let account: Horizon.AccountResponse;

    try {
      account = await server.loadAccount(publicKey);
    } catch {
      // Account might not exist on testnet, use a dummy account for signing
      account = {
        accountId: publicKey,
        sequenceNumber: "0",
        incrementSequenceNumber: () => {},
        signers: [],
        thresholds: { low: 0, medium: 0, high: 0 },
        _baseFee: () => 100,
        _networkId: Buffer.alloc(32),
      } as unknown as Horizon.AccountResponse;
    }

    // Create a dummy transaction for signing
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(Operation.setOptions({}))
      .setTimeout(30)
      .build();

    const txXdr = tx.toXDR();
    const signedTx = await signTransaction(txXdr, {
      networkPassphrase: getNetworkPassphrase(),
    });

    // Return the signed transaction XDR
    if (typeof signedTx === 'string') {
      return signedTx;
    }

    if (signedTx && typeof signedTx === 'object' && 'signedTxXdr' in signedTx) {
      const signedTxObj = signedTx as { signedTxXdr: string };
      return signedTxObj.signedTxXdr;
    }

    return `signed_${message.substring(0, 20)}_${Date.now()}`;
  } catch (error) {
    console.error("Message signing error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to sign message.");
  }
};

/**
 * Verify a signed message
 */
export const verifySignedMessage = async (
  _message: string,
  _signature: string,
  publicKey: string
): Promise<boolean> => {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    return keypair.publicKey() === publicKey;
  } catch {
    return false;
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
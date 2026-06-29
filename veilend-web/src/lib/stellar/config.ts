/**
 * Stellar network configuration for VeilLend
 */

export const STELLAR_CONFIG = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org",
  networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  appName: "VeilLend",
};

export const getHorizonUrl = (): string => {
  return STELLAR_CONFIG.horizonUrl;
};

export const getNetworkPassphrase = (): string => {
  return STELLAR_CONFIG.networkPassphrase;
};

export const isTestnet = (): boolean => {
  return STELLAR_CONFIG.network === "testnet";
};
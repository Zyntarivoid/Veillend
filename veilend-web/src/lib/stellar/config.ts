/**
 * Stellar network configuration for VeilLend
 */

import { publicEnv } from "../env";

export const STELLAR_CONFIG = {
  network: publicEnv.NEXT_PUBLIC_STELLAR_NETWORK,
  horizonUrl: publicEnv.NEXT_PUBLIC_HORIZON_URL,
  networkPassphrase: publicEnv.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
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

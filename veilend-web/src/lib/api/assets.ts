import { fetchValidated } from '@/lib/api/validated-fetch';
import {
  SupportedAssetsResponseSchema,
  ValidationError,
  type SupportedAssetItem,
} from '@/lib/validation/api-schemas';

export interface SupportedAsset {
  symbol: string;
  name: string;
  contractId: string;
  decimals: number;
  priceUsd: number;
  walletBalance: number;
  depositedBalance: number;
  borrowedBalance: number;
  isSupported: boolean;
  logoUrl?: string;
}

const DEFAULT_SUPPORTED_ASSETS: SupportedAsset[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    contractId: 'CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD',
    decimals: 7,
    priceUsd: 1.0,
    walletBalance: 150000.0,
    depositedBalance: 50000.0,
    borrowedBalance: 0.0,
    isSupported: true,
  },
  {
    symbol: 'XLM',
    name: 'Native Lumens',
    contractId: 'CAS3J7GYLGXMF6TDJBBYYQU3SRA5W3WKVR6SXLB6ERBNNRQMXYCBY6TN',
    decimals: 7,
    priceUsd: 0.13,
    walletBalance: 85400.0,
    depositedBalance: 0.0,
    borrowedBalance: 0.0,
    isSupported: true,
  },
  {
    symbol: 'ETH',
    name: 'Wrapped Ethereum',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF45ZG2MG6355F7G6A56XYZ1',
    decimals: 7,
    priceUsd: 2600.0,
    walletBalance: 5.5,
    depositedBalance: 2.0,
    borrowedBalance: 1.0,
    isSupported: true,
  },
  {
    symbol: 'BTC',
    name: 'Wrapped Bitcoin',
    contractId: 'CBLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF45ZG2MG6355F7G6A56XYZ2',
    decimals: 7,
    priceUsd: 65000.0,
    walletBalance: 0.45,
    depositedBalance: 0.1,
    borrowedBalance: 0.05,
    isSupported: true,
  },
];

/**
 * Fetches supported assets from the B9 supported-assets endpoint (`GET /assets?supported=true`).
 * Falls back to protocol default assets if backend is unreachable or offline.
 */
export async function fetchSupportedAssets(
  userAddress?: string,
): Promise<SupportedAsset[]> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  try {
    const url = userAddress
      ? `${baseUrl}/assets?supported=true&address=${encodeURIComponent(userAddress)}`
      : `${baseUrl}/assets?supported=true`;

    const assetsData = await fetchValidated(url, SupportedAssetsResponseSchema, {
      requestInit: { headers: { 'Cache-Control': 'no-cache' } },
    });

    return assetsData.map((item: SupportedAssetItem, index: number) => {
      const fallback = DEFAULT_SUPPORTED_ASSETS[index % DEFAULT_SUPPORTED_ASSETS.length];
      return {
        symbol: item.symbol,
        name: item.name,
        contractId: item.contractId ?? item.assetAddress ?? fallback.contractId,
        decimals: item.decimals,
        priceUsd: item.priceUsd ?? item.price ?? fallback.priceUsd,
        walletBalance: item.walletBalance ?? fallback.walletBalance,
        depositedBalance: item.depositedBalance ?? fallback.depositedBalance,
        borrowedBalance: item.borrowedBalance ?? fallback.borrowedBalance,
        isSupported: item.isSupported,
        logoUrl: item.logoUrl ?? undefined,
      };
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn('[Assets] API response validation failed; using fallback assets.', error);
    }
    return DEFAULT_SUPPORTED_ASSETS;
  }
}

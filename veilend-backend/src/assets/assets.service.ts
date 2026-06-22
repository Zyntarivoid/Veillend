import { Injectable, NotFoundException } from '@nestjs/common';

export interface AssetRiskParameters {
  collateralFactorBps: number;
  borrowFactorBps: number;
  liquidationThresholdBps: number;
  liquidationPenaltyBps: number;
}

export interface SupportedAssetMetadata {
  id: string;
  symbol: string;
  name: string;
  stellarAssetType: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  assetCode: string;
  issuer: string | null;
  contractAddress: string | null;
  decimals: number;
  supported: boolean;
  canDeposit: boolean;
  canBorrow: boolean;
  priceFeed: 'oracle' | 'fixed-usd';
  risk: AssetRiskParameters;
}

export interface AssetMetadataResponse {
  assets: SupportedAssetMetadata[];
  cache: {
    ttlSeconds: number;
    strategy: string;
  };
}

const CACHE_HINT = {
  ttlSeconds: 60,
  strategy: 'public-read-mostly',
};

const SUPPORTED_ASSETS: SupportedAssetMetadata[] = [
  {
    id: 'stellar-native-xlm',
    symbol: 'XLM',
    name: 'Stellar Lumens',
    stellarAssetType: 'native',
    assetCode: 'XLM',
    issuer: null,
    contractAddress: null,
    decimals: 7,
    supported: true,
    canDeposit: true,
    canBorrow: true,
    priceFeed: 'oracle',
    risk: {
      collateralFactorBps: 7_500,
      borrowFactorBps: 6_500,
      liquidationThresholdBps: 8_000,
      liquidationPenaltyBps: 500,
    },
  },
  {
    id: 'stellar-testnet-usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    stellarAssetType: 'credit_alphanum4',
    assetCode: 'USDC',
    issuer: null,
    contractAddress: null,
    decimals: 7,
    supported: true,
    canDeposit: true,
    canBorrow: true,
    priceFeed: 'fixed-usd',
    risk: {
      collateralFactorBps: 8_500,
      borrowFactorBps: 8_000,
      liquidationThresholdBps: 9_000,
      liquidationPenaltyBps: 300,
    },
  },
];

@Injectable()
export class AssetsService {
  getSupportedAssets(): AssetMetadataResponse {
    return {
      assets: SUPPORTED_ASSETS.map((asset) => ({ ...asset })),
      cache: { ...CACHE_HINT },
    };
  }

  getAssetBySymbol(symbol: string): SupportedAssetMetadata {
    const asset = SUPPORTED_ASSETS.find(
      (candidate) => candidate.symbol.toLowerCase() === symbol.toLowerCase(),
    );

    if (!asset) {
      throw new NotFoundException(`Unsupported asset: ${symbol}`);
    }

    return { ...asset };
  }
}

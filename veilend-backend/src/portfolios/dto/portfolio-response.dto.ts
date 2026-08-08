/**
 * Wallet-scoped dashboard portfolio payload.
 * All numeric amounts that come from Horizon are human-readable floats;
 * protocol position raw amounts stay as strings to preserve BigInt precision.
 */
export interface PortfolioBalanceDto {
  asset: string;
  balance: number;
  /** Issuer account for classic assets; null for native XLM */
  issuer: string | null;
}

export interface PortfolioPositionDto {
  assetCode: string;
  assetContractId: string | null;
  depositedRaw: string;
  borrowedRaw: string;
  depositedUsd: number;
  borrowedUsd: number;
  healthFactor: number | null;
  isStale: boolean;
}

export interface PortfolioData {
  walletAddress: string;
  /** True when the wallet has no Horizon account and no indexed positions */
  empty: boolean;
  /** Native XLM balance (0 when account missing) */
  balance: number;
  /** Sum of deposited USD from protocol positions (fallback: 0) */
  collateralValue: number;
  /** Sum of borrowed USD from protocol positions */
  borrowedValue: number;
  /** Max additional borrow estimate from collateral minus debt */
  availableToBorrow: number;
  /**
   * Aggregate health factor (collateral / debt).
   * null when there is no outstanding debt (safe / infinite).
   */
  healthFactor: number | null;
  balances: PortfolioBalanceDto[];
  positions: PortfolioPositionDto[];
  source: {
    horizon: boolean;
    protocol: boolean;
  };
}

export interface AssetBalance {
  assetSymbol: string;
  assetName: string;
  balance: number;
  usdValue: number;
  /** Asset decimal precision (for display tooltip) */
  decimals?: number;
  /** Per-asset LTV used in HF calculation */
  minCollateralRatio?: number;
  /** Remote logo URL if available */
  logoUrl?: string;
}

export interface HfBreakdownItem {
  symbol: string;
  depositedUsd: number;
  minCollateralRatio: number;
  /** depositedUsd × minCollateralRatio */
  weightedUsd: number;
}

export interface PortfolioData {
  totalBalanceUsd: number;
  healthFactor: number;
  totalDepositedUsd: number;
  totalBorrowedUsd: number;
  depositedAssets: AssetBalance[];
  borrowedAssets: AssetBalance[];
  lastUpdated: string; // ISO timestamp
  /** Per-asset HF contribution (empty when no borrows or warning is set) */
  hfBreakdown: HfBreakdownItem[];
  /**
   * Set when an asset's minCollateralRatio is unknown and HF cannot be
   * computed accurately. Display this string to the user instead of the HF.
   */
  hfWarning?: string;
}

export type ActivityActionType = 'DEPOSIT' | 'BORROW' | 'REPAY' | 'WITHDRAW';

export interface ActivityEvent {
  id: string;
  action: ActivityActionType;
  assetSymbol: string;
  amount: number;
  usdValue: number;
  timestamp: string; // ISO timestamp
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  txHash?: string;
}

export interface DashboardData {
  portfolio: PortfolioData;
  recentActivity: ActivityEvent[];
}

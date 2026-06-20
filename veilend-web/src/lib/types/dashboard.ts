export interface AssetBalance {
  assetSymbol: string;
  assetName: string;
  balance: number;
  usdValue: number;
}

export interface PortfolioData {
  totalBalanceUsd: number;
  healthFactor: number;
  totalDepositedUsd: number;
  totalBorrowedUsd: number;
  depositedAssets: AssetBalance[];
  borrowedAssets: AssetBalance[];
  lastUpdated: string; // ISO timestamp
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

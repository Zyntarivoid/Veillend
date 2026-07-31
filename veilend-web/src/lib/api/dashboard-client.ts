import { DashboardData, AssetBalance, ActivityEvent, ActivityActionType } from '../types/dashboard';

export interface DashboardClientConfig {
  apiBaseUrl: string;
  refreshInterval?: number;
}

export class DashboardClient {
  private apiBaseUrl: string;
  private refreshInterval: number;
  private abortController: AbortController | null = null;

  constructor(config: DashboardClientConfig) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.refreshInterval = config.refreshInterval || 10000;
  }

  async fetchDashboardData(address: string, signal?: AbortSignal): Promise<DashboardData> {
    if (!address || !address.startsWith('G')) {
      throw new Error('Invalid Stellar address provided');
    }

    try {
      const controller = new AbortController();
      const combinedSignal = signal ? this.combineSignals(signal, controller.signal) : controller.signal;

      const [positionsRes, transactionsRes, pricesRes] = await Promise.all([
        fetch(`${this.apiBaseUrl}/indexer/positions/${address}`, { 
          signal: combinedSignal,
          headers: { 'Cache-Control': 'no-cache' }
        }),
        fetch(`${this.apiBaseUrl}/indexer/transactions/${address}`, { 
          signal: combinedSignal,
          headers: { 'Cache-Control': 'no-cache' }
        }),
        fetch(`${this.apiBaseUrl}/oracle/prices`, { 
          signal: combinedSignal,
          headers: { 'Cache-Control': 'no-cache' }
        })
      ]);

      if (!positionsRes.ok || !transactionsRes.ok || !pricesRes.ok) {
        const errorDetails = {
          positions: positionsRes.status,
          transactions: transactionsRes.status,
          prices: pricesRes.status
        };
        throw new Error(`Failed to fetch data from indexer: ${JSON.stringify(errorDetails)}`);
      }

      const [positionsData, transactionsData, pricesData] = await Promise.all([
        positionsRes.json(),
        transactionsRes.json(),
        pricesRes.json()
      ]);

      return this.transformDashboardData(
        positionsData.positions || [],
        transactionsData.transactions || [],
        pricesData.prices || {}
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      console.error('Dashboard API Error:', error);
      throw new Error('Failed to fetch live dashboard data. Please check your connection.');
    }
  }

  private combineSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();

    if (signal1.aborted) {
      controller.abort();
      return controller.signal;
    }
    if (signal2.aborted) {
      controller.abort();
      return controller.signal;
    }

    signal1.addEventListener('abort', onAbort, { once: true });
    signal2.addEventListener('abort', onAbort, { once: true });

    return controller.signal;
  }

  private transformDashboardData(
    positions: Array<{ assetAddress: string; depositedAmount: string | number; borrowedAmount: string | number }>,
    transactions: Array<{ id: string; type: string; amount: string | number; assetAddress: string; timestamp: string; txHash: string }>,
    prices: Record<string, number>
  ): DashboardData {
    let totalDepositedUsd = 0;
    let totalBorrowedUsd = 0;
    const depositedAssets: AssetBalance[] = [];
    const borrowedAssets: AssetBalance[] = [];

    // Process positions with real oracle prices
    if (Array.isArray(positions) && positions.length > 0) {
      positions.forEach((pos) => {
        const deposited = Number(pos.depositedAmount) / 1e7;
        const borrowed = Number(pos.borrowedAmount) / 1e7;
        
        // Get price from oracle, default to 0 if not available
        const price = prices[pos.assetAddress] || 0;

        if (deposited > 0 && price > 0) {
          const usdValue = deposited * price;
          totalDepositedUsd += usdValue;
          depositedAssets.push({
            assetSymbol: this.extractAssetSymbol(pos.assetAddress),
            assetName: pos.assetAddress,
            balance: deposited,
            usdValue,
          });
        }

        if (borrowed > 0 && price > 0) {
          const usdValue = borrowed * price;
          totalBorrowedUsd += usdValue;
          borrowedAssets.push({
            assetSymbol: this.extractAssetSymbol(pos.assetAddress),
            assetName: pos.assetAddress,
            balance: borrowed,
            usdValue,
          });
        }
      });
    }

    // Calculate health factor with proper LTV
    const healthFactor = totalBorrowedUsd === 0 
      ? Infinity 
      : Math.min((totalDepositedUsd * 0.8) / totalBorrowedUsd, 99.99);
    
    const totalBalanceUsd = totalDepositedUsd - totalBorrowedUsd;

    // Process transactions with real prices
    let recentActivity: ActivityEvent[] = [];
    
    if (Array.isArray(transactions) && transactions.length > 0) {
      const mappedActivities = transactions.map((tx) => {
        const amount = Number(tx.amount) / 1e7;
        const price = prices[tx.assetAddress] || 0;
        const usdValue = amount * price;
        
        // Skip transactions with no value
        if (usdValue <= 0) {
          return null;
        }
        
        // Create activity with proper status type
        const activity: ActivityEvent = {
          id: tx.id,
          action: this.mapTransactionType(tx.type),
          assetSymbol: this.extractAssetSymbol(tx.assetAddress),
          amount,
          usdValue,
          timestamp: tx.timestamp,
          status: 'COMPLETED', // All indexer transactions are completed
          txHash: tx.txHash,
        };
        
        return activity;
      });
      
      // Filter out null values and assert the type
      recentActivity = mappedActivities
        .filter((activity): activity is ActivityEvent => activity !== null)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 50);
    }

    return {
      portfolio: {
        totalBalanceUsd,
        healthFactor,
        totalDepositedUsd,
        totalBorrowedUsd,
        depositedAssets,
        borrowedAssets,
        lastUpdated: new Date().toISOString(),
      },
      recentActivity,
    };
  }

  private extractAssetSymbol(assetAddress: string): string {
    // Extract asset symbol from address
    if (assetAddress.includes('USDC')) return 'USDC';
    if (assetAddress.includes('XLM')) return 'XLM';
    if (assetAddress.includes('BTC')) return 'BTC';
    if (assetAddress.includes('ETH')) return 'ETH';
    return assetAddress.slice(-4);
  }

  private mapTransactionType(type: string): ActivityActionType {
    const normalizedType = type.toUpperCase();
    switch (normalizedType) {
      case 'DEPOSIT':
      case 'SUPPLY':
        return 'DEPOSIT';
      case 'BORROW':
        return 'BORROW';
      case 'REPAY':
      case 'REPAYMENT':
        return 'REPAY';
      case 'WITHDRAW':
      case 'WITHDRAWAL':
        return 'WITHDRAW';
      default:
        console.warn(`Unknown transaction type: ${type}, defaulting to DEPOSIT`);
        return 'DEPOSIT';
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// Singleton instance
let dashboardClientInstance: DashboardClient | null = null;

export function getDashboardClient(): DashboardClient {
  if (!dashboardClientInstance) {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    dashboardClientInstance = new DashboardClient({ apiBaseUrl });
  }
  return dashboardClientInstance;
}
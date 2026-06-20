import { DashboardData, ActivityActionType, AssetBalance } from '../types/dashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// For the demo/campaign, we can use a hardcoded or random dummy address if none is provided.
// In a real app with wallet connect, this would be passed dynamically.
const DEMO_ADDRESS = 'GCOQ4Z...'; // example stellar pubkey

export async function fetchDashboardData(address: string = DEMO_ADDRESS): Promise<DashboardData> {
  try {
    const [positionsRes, transactionsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/indexer/positions/${address}`, { next: { revalidate: 10 } }),
      fetch(`${API_BASE_URL}/indexer/transactions/${address}`, { next: { revalidate: 10 } })
    ]);

    if (!positionsRes.ok || !transactionsRes.ok) {
      throw new Error('Failed to fetch data from live indexer endpoints');
    }

    const { positions } = await positionsRes.json();
    const { transactions } = await transactionsRes.json();

    let totalDepositedUsd = 0;
    let totalBorrowedUsd = 0;
    const depositedAssets: AssetBalance[] = [];
    const borrowedAssets: AssetBalance[] = [];

    // Map positions (assuming naive 1:1 USD pricing for demo unless oracle is integrated)
    // The backend returns IndexerPosition: { assetAddress, depositedAmount, borrowedAmount }
    if (Array.isArray(positions)) {
      positions.forEach((pos: any) => {
        const deposited = Number(pos.depositedAmount) / 1e7; // Assuming 7 decimals (Stellar standard)
        const borrowed = Number(pos.borrowedAmount) / 1e7;
        
        // Mock price for demo since Oracle might not be fully wired in the read models yet
        const price = pos.assetAddress.includes('USDC') ? 1.0 : 0.11; // Dummy XLM price

        if (deposited > 0) {
          const usdValue = deposited * price;
          totalDepositedUsd += usdValue;
          depositedAssets.push({
            assetSymbol: pos.assetAddress.substring(0, 4), // Dummy symbol from address
            assetName: pos.assetAddress,
            balance: deposited,
            usdValue,
          });
        }

        if (borrowed > 0) {
          const usdValue = borrowed * price;
          totalBorrowedUsd += usdValue;
          borrowedAssets.push({
            assetSymbol: pos.assetAddress.substring(0, 4),
            assetName: pos.assetAddress,
            balance: borrowed,
            usdValue,
          });
        }
      });
    }

    const healthFactor = totalBorrowedUsd === 0 ? 99.99 : (totalDepositedUsd * 0.8) / totalBorrowedUsd; // Assumed 80% LTV
    const totalBalanceUsd = totalDepositedUsd - totalBorrowedUsd;

    // Map transactions
    const recentActivity = Array.isArray(transactions) ? transactions.map((tx: any) => {
      const amount = Number(tx.amount) / 1e7;
      const price = tx.assetAddress.includes('USDC') ? 1.0 : 0.11;
      return {
        id: tx.id,
        action: tx.type.toUpperCase() as ActivityActionType,
        assetSymbol: tx.assetAddress.substring(0, 4),
        amount,
        usdValue: amount * price,
        timestamp: tx.timestamp,
        status: 'COMPLETED' as const,
        txHash: tx.txHash,
      };
    }).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];

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
  } catch (error) {
    console.error('API Error:', error);
    throw new Error('Could not load live dashboard data. Is the NestJS indexer running?');
  }
}

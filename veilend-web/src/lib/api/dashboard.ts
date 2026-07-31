import { DashboardData, ActivityActionType, AssetBalance } from '../types/dashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Define types for API responses
interface IndexerPosition {
  assetAddress: string;
  depositedAmount: string | number;
  borrowedAmount: string | number;
}

interface IndexerTransaction {
  id: string;
  type: string;
  amount: string | number;
  assetAddress: string;
  timestamp: string;
  txHash: string;
}

interface OraclePrice {
  [assetAddress: string]: number;
}

/**
 * Fetches live dashboard data for a specific wallet address
 * @param address - Stellar wallet address (must start with 'G')
 * @returns Promise<DashboardData>
 * @throws Error if address is invalid or API calls fail
 */
export async function fetchDashboardData(address: string): Promise<DashboardData> {
  // Validate address
  if (!address || !address.startsWith('G')) {
    throw new Error('Invalid Stellar address provided. Address must start with "G".');
  }

  try {
    const [positionsRes, transactionsRes, pricesRes] = await Promise.all([
      fetch(`${API_BASE_URL}/indexer/positions/${address}`, { 
        next: { revalidate: 10 },
        headers: { 'Cache-Control': 'no-cache' }
      }),
      fetch(`${API_BASE_URL}/indexer/transactions/${address}`, { 
        next: { revalidate: 10 },
        headers: { 'Cache-Control': 'no-cache' }
      }),
      fetch(`${API_BASE_URL}/oracle/prices`, { 
        next: { revalidate: 10 },
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

    const positionsData = await positionsRes.json() as { positions: IndexerPosition[] };
    const transactionsData = await transactionsRes.json() as { transactions: IndexerTransaction[] };
    const pricesData = await pricesRes.json() as { prices: OraclePrice };

    // Validate response structure
    if (!positionsData.positions || !Array.isArray(positionsData.positions)) {
      throw new Error('Invalid positions data format received from indexer');
    }

    let totalDepositedUsd = 0;
    let totalBorrowedUsd = 0;
    const depositedAssets: AssetBalance[] = [];
    const borrowedAssets: AssetBalance[] = [];

    // Map positions with real oracle prices
    const positions = positionsData.positions || [];
    const transactions = transactionsData.transactions || [];
    const prices = pricesData.prices || {};

    positions.forEach((pos: IndexerPosition) => {
      const deposited = Number(pos.depositedAmount) / 1e7;
      const borrowed = Number(pos.borrowedAmount) / 1e7;
      
      // Use oracle price, fallback to 0 if not available
      const price = prices[pos.assetAddress] || 0;

      if (deposited > 0 && price > 0) {
        const usdValue = deposited * price;
        totalDepositedUsd += usdValue;
        depositedAssets.push({
          assetSymbol: extractAssetSymbol(pos.assetAddress),
          assetName: pos.assetAddress,
          balance: deposited,
          usdValue,
        });
      }

      if (borrowed > 0 && price > 0) {
        const usdValue = borrowed * price;
        totalBorrowedUsd += usdValue;
        borrowedAssets.push({
          assetSymbol: extractAssetSymbol(pos.assetAddress),
          assetName: pos.assetAddress,
          balance: borrowed,
          usdValue,
        });
      }
    });

    // Calculate health factor with proper LTV
    const healthFactor = totalBorrowedUsd === 0 
      ? Infinity 
      : Math.min((totalDepositedUsd * 0.8) / totalBorrowedUsd, 99.99);
    
    const totalBalanceUsd = totalDepositedUsd - totalBorrowedUsd;

    // Map transactions with real prices
    const recentActivity = Array.isArray(transactions) 
      ? transactions
          .map((tx: IndexerTransaction) => {
            const amount = Number(tx.amount) / 1e7;
            const price = prices[tx.assetAddress] || 0;
            return {
              id: tx.id,
              action: mapTransactionType(tx.type),
              assetSymbol: extractAssetSymbol(tx.assetAddress),
              amount,
              usdValue: amount * price,
              timestamp: tx.timestamp,
              status: 'COMPLETED' as const,
              txHash: tx.txHash,
            };
          })
          .filter((activity) => activity.usdValue > 0)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50)
      : [];

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
    console.error('Dashboard API Error:', error);
    
    // Re-throw with user-friendly message
    if (error instanceof Error) {
      throw new Error(`Failed to load dashboard data: ${error.message}`);
    }
    throw new Error('Could not load live dashboard data. Please check your connection.');
  }
}

/**
 * Extracts a short asset symbol from the asset address
 * @param assetAddress - Full asset address
 * @returns 4-character symbol
 */
function extractAssetSymbol(assetAddress: string): string {
  // For production, this should use a proper mapping from the backend
  // or extract from the asset code if available
  if (assetAddress.includes('USDC')) return 'USDC';
  if (assetAddress.includes('XLM')) return 'XLM';
  if (assetAddress.includes('BTC')) return 'BTC';
  if (assetAddress.includes('ETH')) return 'ETH';
  return assetAddress.slice(-4);
}

/**
 * Maps transaction type to ActivityActionType
 * @param type - Raw transaction type from indexer
 * @returns Normalized ActivityActionType
 */
function mapTransactionType(type: string): ActivityActionType {
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
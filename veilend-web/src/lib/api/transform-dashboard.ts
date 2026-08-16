import type { ActivityActionType, ActivityEvent, AssetBalance, DashboardData } from '../types/dashboard';
import type { IndexerPosition, IndexerTransaction } from '../schemas/indexer';
import { pickRawAmount, rawStroopsToHuman, toSafeNumber } from '../validation/coerce';

const DEPOSITED_KEYS = ['depositedRaw', 'deposited', 'depositedAmount'] as const;
const BORROWED_KEYS = ['borrowedRaw', 'borrowed', 'borrowedAmount'] as const;
const COLLATERAL_FACTOR = 0.8;
const MAX_HEALTH_FACTOR = 99.99;

function extractAssetSymbol(assetAddress: string): string {
  if (assetAddress.includes('USDC')) return 'USDC';
  if (assetAddress.includes('XLM')) return 'XLM';
  if (assetAddress.includes('BTC')) return 'BTC';
  if (assetAddress.includes('ETH')) return 'ETH';
  return assetAddress.slice(-4);
}

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

function asAmountRecord(position: IndexerPosition): Record<string, unknown> {
  return position;
}

export function transformDashboardData(
  positions: IndexerPosition[],
  transactions: IndexerTransaction[],
  prices: Record<string, number>,
): DashboardData {
  let totalDepositedUsd = 0;
  let totalBorrowedUsd = 0;
  const depositedAssets: AssetBalance[] = [];
  const borrowedAssets: AssetBalance[] = [];

  for (const position of positions) {
    const record = asAmountRecord(position);
    const deposited = rawStroopsToHuman(pickRawAmount(record, DEPOSITED_KEYS));
    const borrowed = rawStroopsToHuman(pickRawAmount(record, BORROWED_KEYS));
    const price = toSafeNumber(prices[position.assetAddress]) ?? 0;

    if (deposited !== null && deposited > 0 && price > 0) {
      const usdValue = deposited * price;
      totalDepositedUsd += usdValue;
      depositedAssets.push({
        assetSymbol: extractAssetSymbol(position.assetAddress),
        assetName: position.assetAddress,
        balance: deposited,
        usdValue,
      });
    }

    if (borrowed !== null && borrowed > 0 && price > 0) {
      const usdValue = borrowed * price;
      totalBorrowedUsd += usdValue;
      borrowedAssets.push({
        assetSymbol: extractAssetSymbol(position.assetAddress),
        assetName: position.assetAddress,
        balance: borrowed,
        usdValue,
      });
    }
  }

  const healthFactor =
    totalBorrowedUsd === 0
      ? Infinity
      : Math.min((totalDepositedUsd * COLLATERAL_FACTOR) / totalBorrowedUsd, MAX_HEALTH_FACTOR);

  const recentActivity: ActivityEvent[] = transactions
    .map((tx) => {
      const amount = rawStroopsToHuman(tx.amount);
      if (amount === null) {
        return null;
      }
      const price = toSafeNumber(prices[tx.assetAddress]) ?? 0;
      const usdValue = amount * price;
      if (usdValue <= 0) {
        return null;
      }
      const activity: ActivityEvent = {
        id: tx.id,
        action: mapTransactionType(tx.type),
        assetSymbol: extractAssetSymbol(tx.assetAddress),
        amount,
        usdValue,
        timestamp: tx.timestamp,
        status: 'COMPLETED',
        txHash: tx.txHash,
      };
      return activity;
    })
    .filter((activity): activity is ActivityEvent => activity !== null)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);

  return {
    portfolio: {
      totalBalanceUsd: totalDepositedUsd - totalBorrowedUsd,
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

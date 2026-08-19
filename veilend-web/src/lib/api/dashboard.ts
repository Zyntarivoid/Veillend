import { backendFetch } from '@/lib/server/backendFetch';
import {
  AssetRegistryResponseSchema,
  IndexerPositionsResponseSchema,
  IndexerTransactionsResponseSchema,
  OraclePricesResponseSchema,
  type IndexerTransaction,
} from '@/lib/validation/api-schemas';
import { requireSafeNumber } from '@/lib/validation/safe-numbers';
import type {
  ActivityActionType,
  AssetBalance,
  DashboardData,
  HfBreakdownItem,
} from '@/lib/types/dashboard';

import {
  buildAssetRegistry,
  registryDecimals,
  registrySymbol,
  registryName,
  registryMcr,
  warnRegistryUnavailable,
} from './assetRegistry';
import { fetchValidated } from './validated-fetch';

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Fetches live dashboard data for a specific wallet address.
 * Uses per-asset decimals and MCR from the /assets registry (falls back
 * to hardcoded table when endpoint is unavailable).
 */
export async function fetchDashboardData(address: string): Promise<DashboardData> {
  if (!address || !address.startsWith('G')) {
    throw new Error('Invalid Stellar address provided. Address must start with "G".');
  }

  try {
    const fetcher = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      backendFetch(String(input), init);
    const [positionsData, transactionsData, pricesData, rawAssets] = await Promise.all([
      fetchValidated(`/indexer/positions/${address}`, IndexerPositionsResponseSchema, {
        fetcher,
        requestInit: {
          next: { revalidate: 10 },
          headers: { 'Cache-Control': 'no-cache' },
        },
      }),
      fetchValidated(`/indexer/transactions/${address}`, IndexerTransactionsResponseSchema, {
        fetcher,
        requestInit: {
          next: { revalidate: 10 },
          headers: { 'Cache-Control': 'no-cache' },
        },
      }),
      fetchValidated('/oracle/prices', OraclePricesResponseSchema, {
        fetcher,
        requestInit: {
          next: { revalidate: 10 },
          headers: { 'Cache-Control': 'no-cache' },
        },
      }),
      fetchValidated('/assets', AssetRegistryResponseSchema, {
        fetcher,
        requestInit: { next: { revalidate: 300 } },
      }).catch(() => {
        warnRegistryUnavailable();
        return [];
      }),
    ]);
    const registry = buildAssetRegistry(rawAssets);

    const positions = positionsData.positions;
    const transactions = transactionsData.transactions;
    const prices = pricesData.prices;

    // ── Process positions ─────────────────────────────────────────────────
    let totalDepositedUsd = 0;
    let totalBorrowedUsd = 0;
    const depositedAssets: AssetBalance[] = [];
    const borrowedAssets: AssetBalance[] = [];
    const hfBreakdown: HfBreakdownItem[] = [];
    let weightedCollateral = 0;
    let missingMcrSymbol: string | null = null;

    for (const [index, pos] of positions.entries()) {
      const decimals = registryDecimals(registry, pos.assetAddress);
      const deposited = requireSafeNumber(pos.depositedRaw, decimals, [
        'positions',
        index,
        'depositedRaw',
      ]);
      const borrowed = requireSafeNumber(pos.borrowedRaw, decimals, [
        'positions',
        index,
        'borrowedRaw',
      ]);
      const symbol    = registrySymbol(registry, pos.assetAddress);
      const name      = registryName(registry, pos.assetAddress);
      const price     = prices[pos.assetAddress] ?? 0;
      const logoUrl   = registry.get(pos.assetAddress)?.logoUrl ?? undefined;
      const mcr       = registryMcr(registry, pos.assetAddress);

      if (deposited > 0 && price > 0) {
        const usdValue = deposited * price;
        totalDepositedUsd += usdValue;
        depositedAssets.push({
          assetSymbol: symbol,
          assetName: name,
          balance: deposited,
          usdValue,
          decimals,
          minCollateralRatio: mcr ?? undefined,
          logoUrl,
        });
        if (mcr != null) {
          const weighted = usdValue * mcr;
          weightedCollateral += weighted;
          hfBreakdown.push({ symbol, depositedUsd: usdValue, minCollateralRatio: mcr, weightedUsd: weighted });
        } else if (usdValue > 0 && !missingMcrSymbol) {
          missingMcrSymbol = symbol;
        }
      }

      if (borrowed > 0 && price > 0) {
        const usdValue = borrowed * price;
        totalBorrowedUsd += usdValue;
        borrowedAssets.push({
          assetSymbol: symbol,
          assetName: name,
          balance: borrowed,
          usdValue,
          decimals,
          logoUrl,
        });
      }
    }

    // ── Health factor (per-asset MCR weighted) ────────────────────────────
    let healthFactor: number;
    let hfWarning: string | undefined;

    if (totalBorrowedUsd === 0) {
      healthFactor = Infinity;
    } else if (missingMcrSymbol) {
      healthFactor = -1; // sentinel — UI should show hfWarning instead
      hfWarning = 'Asset registry not loaded — refresh';
    } else {
      healthFactor = Math.min(weightedCollateral / totalBorrowedUsd, 99.99);
    }

    const totalBalanceUsd = totalDepositedUsd - totalBorrowedUsd;

    // ── Process transactions ──────────────────────────────────────────────
    const recentActivity = transactions
          .map((tx: IndexerTransaction, index) => {
            const decimals = registryDecimals(registry, tx.assetAddress);
            const amount = requireSafeNumber(tx.amount, decimals, [
              'transactions',
              index,
              'amount',
            ]);
            const price    = prices[tx.assetAddress] ?? 0;
            return {
              id: tx.id,
              action: mapTransactionType(tx.type),
              assetSymbol: registrySymbol(registry, tx.assetAddress),
              amount,
              usdValue: amount * price,
              timestamp: tx.timestamp,
              status: 'COMPLETED' as const,
              txHash: tx.txHash,
            };
          })
          .filter((activity) => activity.usdValue > 0)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50);

    return {
      portfolio: {
        totalBalanceUsd,
        healthFactor,
        totalDepositedUsd,
        totalBorrowedUsd,
        depositedAssets,
        borrowedAssets,
        lastUpdated: new Date().toISOString(),
        hfBreakdown,
        hfWarning,
      },
      recentActivity,
    };
  } catch (error) {
    console.error('Dashboard API Error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Could not load live dashboard data. Please check your connection.');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

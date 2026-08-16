import { DashboardData } from '../types/dashboard';
import { fetchJson, type FetchJsonOptions } from './fetch-json';
import { transformDashboardData } from './transform-dashboard';
import {
  indexerPositionsResponseSchema,
  indexerTransactionsResponseSchema,
} from '../schemas/indexer';
import { oraclePricesResponseSchema } from '../schemas/oracle';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type FetchDashboardOptions = Pick<FetchJsonOptions, 'signal' | 'sleep' | 'maxAttempts'> & {
  apiBaseUrl?: string;
};

/**
 * Fetches live dashboard data for a specific wallet address
 * @param address - Stellar wallet address (must start with 'G')
 * @returns Promise<DashboardData>
 * @throws Error if address is invalid or API calls fail
 */
export async function fetchDashboardData(
  address: string,
  options: FetchDashboardOptions = {},
): Promise<DashboardData> {
  if (!address || !address.startsWith('G')) {
    throw new Error('Invalid Stellar address provided. Address must start with "G".');
  }

  const apiBaseUrl = options.apiBaseUrl || API_BASE_URL;
  const init: FetchJsonOptions = {
    headers: { 'Cache-Control': 'no-cache' },
    next: { revalidate: 10 },
    sleep: options.sleep,
    maxAttempts: options.maxAttempts,
    signal: options.signal,
  };

  const [positionsData, transactionsData, pricesData] = await Promise.all([
    fetchJson(`${apiBaseUrl}/indexer/positions/${address}`, indexerPositionsResponseSchema, init),
    fetchJson(
      `${apiBaseUrl}/indexer/transactions/${address}`,
      indexerTransactionsResponseSchema,
      init,
    ),
    fetchJson(`${apiBaseUrl}/oracle/prices`, oraclePricesResponseSchema, init),
  ]);

  return transformDashboardData(
    positionsData.positions,
    transactionsData.transactions,
    pricesData.prices,
  );
}

import { DashboardData } from '../types/dashboard';
import { fetchDashboardData as fetchDashboardDataFromApi } from './dashboard';
import type { FetchDashboardOptions } from './dashboard';

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
    const options: FetchDashboardOptions = { signal, apiBaseUrl: this.apiBaseUrl };
    return fetchDashboardDataFromApi(address, options);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

let dashboardClientInstance: DashboardClient | null = null;

export function getDashboardClient(): DashboardClient {
  if (!dashboardClientInstance) {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    dashboardClientInstance = new DashboardClient({ apiBaseUrl });
  }
  return dashboardClientInstance;
}

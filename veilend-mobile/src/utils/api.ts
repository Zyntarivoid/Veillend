import axios from 'axios';
import { useStore } from '../store/store';
import { Platform } from 'react-native';

const API_URL =
  Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = useStore.getState().authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type PortfolioDashboardResponse = {
  totalBalance?: number | string;
  netBalance?: number | string;
  deposited?: number | string;
  totalDeposited?: number | string;
  collateralValue?: number | string;
  borrowed?: number | string;
  totalBorrowed?: number | string;
  borrowedValue?: number | string;
  healthFactor?: number | string;
  status?: string;
};

export type TransactionActivityResponse = {
  id: string;
  walletAddress?: string;
  type: 'deposit' | 'borrow' | 'repay' | 'withdraw';
  assetAddress: string;
  amount: string;
  ledger?: number;
  txHash?: string;
  timestamp: string;
};

type PageResponse<T> = {
  data?: T[];
  transactions?: T[];
  activity?: T[];
};

const unwrapObjectData = <T>(payload: T | { data?: T }): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data ?? (payload as T);
  }
  return payload as T;
};

export const fetchPortfolioDashboard = async (
  walletAddress: string,
): Promise<PortfolioDashboardResponse> => {
  const res = await api.get(`/portfolios/${walletAddress}/dashboard`);
  return unwrapObjectData<PortfolioDashboardResponse>(res.data);
};

export const fetchTransactionActivity = async (
  walletAddress: string,
): Promise<TransactionActivityResponse[]> => {
  const res = await api.get(`/transactions/${walletAddress}/activity`, {
    params: { page: 1, take: 10, order: 'DESC' },
  });
  const payload = Array.isArray(res.data?.data)
    ? (res.data as PageResponse<TransactionActivityResponse>)
    : unwrapObjectData<PageResponse<TransactionActivityResponse>>(res.data);

  return payload.data ?? payload.transactions ?? payload.activity ?? [];
};

export default api;

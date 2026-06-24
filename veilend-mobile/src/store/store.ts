import { create } from 'zustand';
import api from '../utils/api';
// prefer expo SecureStore when installed; fall back to local shim
import * as SecureStoreShim from '../utils/secureStoreShim';
let SecureStore: typeof SecureStoreShim;
try {
  // attempt to require the real expo-secure-store if available
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-ignore
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = SecureStoreShim as any;
}

type Nullable<T> = T | null;

type AuthState = {
  address: Nullable<string>;
  authToken: Nullable<string>;
  setAddress: (address: string | null) => void;
  setAuthToken: (token: string | null) => void;
  logout: () => void;
  requestNonce: (walletAddress: string) => Promise<string>;
  verify: (payload: { walletAddress: string; nonce: string; signature: string }) => Promise<string>;
  authLoading: boolean;
};

type UiState = {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  expectedNetwork: string;
  currentNetwork: string | null;
  lastProtocolSyncAt: number | null;
  protocolStatusLoading: boolean;
  protocolStatusError: string | null;
  refreshProtocolStatus: () => Promise<void>;
};

type LendingState = {
  lastLendingTx: Nullable<any>;
  lendingLoading: boolean;
  deposit: (params: { amount: string; asset: string }) => Promise<any>;
  withdraw: (params: { amount: string; asset: string }) => Promise<any>;
  borrow: (params: { amount: string; asset: string }) => Promise<any>;
  repay: (params: { amount: string; asset: string }) => Promise<any>;
};

export const useStore = create<AuthState & UiState & LendingState>((
  set: (partial: Partial<AuthState & UiState & LendingState> | ((state: AuthState & UiState & LendingState) => Partial<AuthState & UiState & LendingState>)) => void,
  get: () => AuthState & UiState & LendingState
) => ({
  // Auth
  address: null,
  authToken: null,
  authLoading: false,
  setAddress: (address: string | null) => {
    set({ address });
    try {
      if (address) SecureStore.setItemAsync('address', address);
      else SecureStore.deleteItemAsync('address');
    } catch (e) {}
  },
  setAuthToken: (token: string | null) => {
    set({ authToken: token });
    try {
      if (token) SecureStore.setItemAsync('authToken', token);
      else SecureStore.deleteItemAsync('authToken');
    } catch (e) {
      // ignore persistence errors
    }
  },
  logout: () => {
    set({ address: null, authToken: null, isPrivacyMode: false });
    try { SecureStore.deleteItemAsync('authToken'); } catch (e) {}
  },

  // UI
  isPrivacyMode: false,
  togglePrivacyMode: () => set((state: AuthState & UiState & LendingState) => ({ isPrivacyMode: !state.isPrivacyMode })),
  expectedNetwork: 'testnet',
  currentNetwork: 'testnet',
  lastProtocolSyncAt: Date.now(),
  protocolStatusLoading: false,
  protocolStatusError: null,
  refreshProtocolStatus: async () => {
    set({ protocolStatusLoading: true, protocolStatusError: null });
    try {
      const res = await api.get('/health');
      const network = res.data?.network ?? get().currentNetwork ?? get().expectedNetwork;
      set({
        currentNetwork: network,
        lastProtocolSyncAt: Date.now(),
        protocolStatusLoading: false,
      });
    } catch (err: any) {
      set({
        protocolStatusError: err?.message ?? 'Unable to refresh protocol status',
        protocolStatusLoading: false,
      });
      throw err;
    }
  },

  // Async helpers (Auth)
  requestNonce: async (walletAddress: string) => {
    const res = await api.post('/auth/nonce', { walletAddress });
    return res.data?.nonce;
  },
  verify: async ({ walletAddress, nonce, signature }: { walletAddress: string; nonce: string; signature: string }) => {
    set({ authLoading: true });
    try {
      const res = await api.post('/auth/verify', { walletAddress, nonce, signature });
      const token = res.data?.accessToken || null;
      set({ authLoading: false });
      set({ authToken: token, address: walletAddress });
      try { if (token) SecureStore.setItemAsync('authToken', token); } catch (e) {}
      return token;
    } catch (err) {
      set({ authLoading: false });
      throw err;
    }
  },

  // Lending (placeholder implementations until backend is ready)
  lastLendingTx: null,
  lendingLoading: false,
  deposit: async ({ amount, asset }: { amount: string; asset: string }) => {
    set({ lendingLoading: true });
    try {
      // TODO: Implement deposit endpoint in backend
      const mockTx = { txHash: `mock-deposit-${Date.now()}`, amount, asset, status: 'success' };
      set({ lastLendingTx: mockTx, lendingLoading: false });
      return mockTx;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  withdraw: async ({ amount, asset }: { amount: string; asset: string }) => {
    set({ lendingLoading: true });
    try {
      // TODO: Implement withdraw endpoint in backend
      const mockTx = { txHash: `mock-withdraw-${Date.now()}`, amount, asset, status: 'success' };
      set({ lastLendingTx: mockTx, lendingLoading: false });
      return mockTx;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  borrow: async ({ amount, asset }: { amount: string; asset: string }) => {
    set({ lendingLoading: true });
    try {
      // TODO: Implement borrow endpoint in backend
      const mockTx = { txHash: `mock-borrow-${Date.now()}`, amount, asset, status: 'success' };
      set({ lastLendingTx: mockTx, lendingLoading: false });
      return mockTx;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  repay: async ({ amount, asset }: { amount: string; asset: string }) => {
    set({ lendingLoading: true });
    try {
      // TODO: Implement repay endpoint in backend
      const mockTx = { txHash: `mock-repay-${Date.now()}`, amount, asset, status: 'success' };
      set({ lastLendingTx: mockTx, lendingLoading: false });
      return mockTx;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
}));

// Initialize persisted auth token (if any)
(async () => {
  try {
    const token = await SecureStore.getItemAsync('authToken');
    if (token) {
      useStore.setState({ authToken: token });
    }
    const address = await SecureStore.getItemAsync('address');
    if (address) {
      useStore.setState({ address });
    }
  } catch (e) {
    // ignore
  }
})();

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
  requestNonce: (address: string) => Promise<string>;
  verify: (payload: { address: string; signature: any; typedData: any; publicKey?: string }) => Promise<string>;
  authLoading: boolean;
};

type UiState = {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
};

type LendingState = {
  lastLendingTx: Nullable<any>;
  lendingLoading: boolean;
  deposit: (params: { amount: string; asset: string }) => Promise<any>;
  withdraw: (params: { amount: string; asset: string }) => Promise<any>;
  borrow: (params: { amount: string; asset: string }) => Promise<any>;
  repay: (params: { amount: string; asset: string }) => Promise<any>;
};

type ShieldedState = {
  lastShieldedTx: Nullable<any>;
  shieldedLoading: boolean;
  depositShielded: (params: any) => Promise<any>;
  withdrawShielded: (params: any) => Promise<any>;
};

export const useStore = create<AuthState & UiState & LendingState & ShieldedState>((set, get) => ({
  // Auth
  address: null,
  authToken: null,
  authLoading: false,
  setAddress: (address) => {
    set({ address });
    try {
      if (address) SecureStore.setItemAsync('address', address);
      else SecureStore.deleteItemAsync('address');
    } catch (e) {}
  },
  setAuthToken: (token) => {
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
  togglePrivacyMode: () => set((state) => ({ isPrivacyMode: !state.isPrivacyMode })),

  // Async helpers (Auth)
  requestNonce: async (address: string) => {
    const res = await api.post(`/auth/nonce?address=${address}`);
    return res.data?.nonce;
  },
  verify: async ({ address, signature, typedData, publicKey }) => {
    set({ authLoading: true });
    try {
      const res = await api.post('/auth/verify', { address, signature, typedData, publicKey });
      const token = res.data?.access_token || null;
      set({ authLoading: false });
      set({ authToken: token, address: address });
      try { if (token) SecureStore.setItemAsync('authToken', token); } catch (e) {}
      return token;
    } catch (err) {
      set({ authLoading: false });
      throw err;
    }
  },

  // Lending
  lastLendingTx: null,
  lendingLoading: false,
  deposit: async ({ amount, asset }) => {
    set({ lendingLoading: true });
    try {
      const res = await api.post('/lending-pool/deposit', { amount, asset });
      set({ lastLendingTx: res.data, lendingLoading: false });
      return res.data;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  withdraw: async ({ amount, asset }) => {
    set({ lendingLoading: true });
    try {
      const res = await api.post('/lending-pool/withdraw', { amount, asset });
      set({ lastLendingTx: res.data, lendingLoading: false });
      return res.data;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  borrow: async ({ amount, asset }) => {
    set({ lendingLoading: true });
    try {
      const res = await api.post('/lending-pool/borrow', { amount, asset });
      set({ lastLendingTx: res.data, lendingLoading: false });
      return res.data;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },
  repay: async ({ amount, asset }) => {
    set({ lendingLoading: true });
    try {
      const res = await api.post('/lending-pool/repay', { amount, asset });
      set({ lastLendingTx: res.data, lendingLoading: false });
      return res.data;
    } catch (err) {
      set({ lendingLoading: false });
      throw err;
    }
  },

  // Shielded
  lastShieldedTx: null,
  shieldedLoading: false,
  depositShielded: async (params) => {
    set({ shieldedLoading: true });
    try {
      const res = await api.post('/shielded-pool/deposit_shielded', params);
      set({ lastShieldedTx: res.data, shieldedLoading: false });
      return res.data;
    } catch (err) {
      set({ shieldedLoading: false });
      throw err;
    }
  },
  withdrawShielded: async (params) => {
    set({ shieldedLoading: true });
    try {
      const res = await api.post('/shielded-pool/withdraw_shielded', params);
      set({ lastShieldedTx: res.data, shieldedLoading: false });
      return res.data;
    } catch (err) {
      set({ shieldedLoading: false });
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

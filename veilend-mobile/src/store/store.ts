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

// Keys used for SecureStore persistence
const PERSIST_KEYS = {
  authToken: 'authToken',
  address: 'address',
  isPrivacyMode: 'isPrivacyMode',
  secretKey: 'stellar_secret_key',
} as const;

type AuthState = {
  address: Nullable<string>;
  authToken: Nullable<string>;
  setAddress: (address: string | null) => void;
  setAuthToken: (token: string | null) => void;
  logout: () => void;
  requestNonce: (walletAddress: string) => Promise<string>;
  verify: (payload: { walletAddress: string; nonce: string; signature: string }) => Promise<string>;
  authLoading: boolean;
  sessionRestored: boolean;
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
  shieldedLoading: boolean;
};

type LendingState = {
  lastLendingTx: Nullable<any>;
  lendingLoading: boolean;
  deposit: (params: { amount: string; asset: string }) => Promise<any>;
  withdraw: (params: { amount: string; asset: string }) => Promise<any>;
  borrow: (params: { amount: string; asset: string }) => Promise<any>;
  repay: (params: { amount: string; asset: string }) => Promise<any>;
};

export const useStore = create<AuthState & UiState & LendingState>(
  (set: (partial: Partial<AuthState & UiState & LendingState> | ((state: AuthState & UiState & LendingState) => Partial<AuthState & UiState & LendingState>)) => void, get: () => AuthState & UiState & LendingState) => ({
  // Auth
  address: null,
  authToken: null,
  authLoading: false,
  sessionRestored: false,
  setAddress: (address: string | null) => {
    set({ address });
    try {
      if (address) SecureStore.setItemAsync(PERSIST_KEYS.address, address);
      else SecureStore.deleteItemAsync(PERSIST_KEYS.address);
    } catch (e) {
      // ignore persistence errors
    }
  },
  setAuthToken: (token: string | null) => {
    set({ authToken: token });
    try {
      if (token) SecureStore.setItemAsync(PERSIST_KEYS.authToken, token);
      else SecureStore.deleteItemAsync(PERSIST_KEYS.authToken);
    } catch (e) {
      // ignore persistence errors
    }
  },
  logout: () => {
    // Clear in-memory state
    set({
      address: null,
      authToken: null,
      isPrivacyMode: false,
      sessionRestored: true,
    });
    // Clear ALL persisted keys to prevent stale data on next launch
    try {
      SecureStore.deleteItemAsync(PERSIST_KEYS.authToken);
      SecureStore.deleteItemAsync(PERSIST_KEYS.address);
      SecureStore.deleteItemAsync(PERSIST_KEYS.isPrivacyMode);
      SecureStore.deleteItemAsync(PERSIST_KEYS.secretKey);
    } catch (e) {
      // ignore persistence errors
    }
  },

  // UI
  isPrivacyMode: false,
  togglePrivacyMode: () => {
    const next = !get().isPrivacyMode;
    set({ isPrivacyMode: next });
    try {
      if (next) {
        SecureStore.setItemAsync(PERSIST_KEYS.isPrivacyMode, 'true');
      } else {
        SecureStore.deleteItemAsync(PERSIST_KEYS.isPrivacyMode);
      }
    } catch (e) {
      // ignore persistence errors
    }
  },
  expectedNetwork: 'testnet',
  currentNetwork: 'testnet',
  lastProtocolSyncAt: Date.now(),
  protocolStatusLoading: false,
  protocolStatusError: null,
  shieldedLoading: false,
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
      try {
        if (token) SecureStore.setItemAsync(PERSIST_KEYS.authToken, token);
      } catch (e) {}
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

// ──────────────────────────────────────────────
// Session restore: hydrate Zustand from SecureStore on app launch.
// Uses `sessionRestored` flag so the UI can show a splash until ready.
// ──────────────────────────────────────────────
(async () => {
  try {
    const [token, address, privacyMode] = await Promise.all([
      SecureStore.getItemAsync(PERSIST_KEYS.authToken),
      SecureStore.getItemAsync(PERSIST_KEYS.address),
      SecureStore.getItemAsync(PERSIST_KEYS.isPrivacyMode),
    ]);

    const patch: Partial<AuthState & UiState> = { sessionRestored: true };
    if (token) patch.authToken = token;
    if (address) patch.address = address;
    if (privacyMode === 'true') patch.isPrivacyMode = true;

    useStore.setState(patch);
  } catch (e) {
    // If hydration fails, still mark session as restored so the app doesn't hang
    useStore.setState({ sessionRestored: true });
  }
})();

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

const STORAGE_KEYS = {
  address: 'address',
  authToken: 'authToken',
  isPrivacyMode: 'isPrivacyMode',
  profileImage: 'profileImage',
  profileName: 'profileName',
  stellarSecretKey: 'stellar_secret_key',
};

const setStoredValue = (key: string, value: string | null) => {
  try {
    const operation = value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key);
    void operation.catch(() => {});
  } catch (e) {}
};

type Nullable<T> = T | null;

type AuthState = {
  address: Nullable<string>;
  authToken: Nullable<string>;
  sessionRestored: boolean;
  setAddress: (address: string | null) => void;
  setAuthToken: (token: string | null) => void;
  logout: () => void;
  requestNonce: (walletAddress: string) => Promise<string>;
  verify: (payload: { walletAddress: string; nonce: string; signature: string }) => Promise<string>;
  authLoading: boolean;
};

type UiState = {
  isPrivacyMode: boolean;
  profileImage: Nullable<string>;
  profileName: Nullable<string>;
  setProfileImage: (imageUri: string | null) => void;
  setProfileName: (name: string | null) => void;
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
  sessionRestored: false,
  setAddress: (address) => {
    set({ address });
    setStoredValue(STORAGE_KEYS.address, address);
  },
  setAuthToken: (token) => {
    set({ authToken: token });
    setStoredValue(STORAGE_KEYS.authToken, token);
  },
  logout: () => {
    set({ address: null, authToken: null, isPrivacyMode: false, profileImage: null, profileName: null });
    Object.values(STORAGE_KEYS).forEach((key) => setStoredValue(key, null));
  },

  // UI
  isPrivacyMode: false,
  profileImage: null,
  profileName: null,
  setProfileImage: (profileImage) => {
    set({ profileImage });
    setStoredValue(STORAGE_KEYS.profileImage, profileImage);
  },
  setProfileName: (profileName) => {
    set({ profileName });
    setStoredValue(STORAGE_KEYS.profileName, profileName);
  },
  togglePrivacyMode: () => set((state) => {
    const isPrivacyMode = !state.isPrivacyMode;
    setStoredValue(STORAGE_KEYS.isPrivacyMode, String(isPrivacyMode));
    return { isPrivacyMode };
  }),

  // Async helpers (Auth)
  requestNonce: async (walletAddress: string) => {
    const res = await api.post('/auth/nonce', { walletAddress });
    return res.data?.nonce;
  },
  verify: async ({ walletAddress, nonce, signature }) => {
    set({ authLoading: true });
    try {
      const res = await api.post('/auth/verify', { walletAddress, nonce, signature });
      const token = res.data?.accessToken || null;
      set({ authLoading: false });
      set({ authToken: token, address: walletAddress });
      setStoredValue(STORAGE_KEYS.authToken, token);
      setStoredValue(STORAGE_KEYS.address, walletAddress);
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

// Restore persisted session and preferences before the navigator chooses a route.
(async () => {
  try {
    const [token, address, privacyMode, profileImage, profileName] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEYS.authToken),
      SecureStore.getItemAsync(STORAGE_KEYS.address),
      SecureStore.getItemAsync(STORAGE_KEYS.isPrivacyMode),
      SecureStore.getItemAsync(STORAGE_KEYS.profileImage),
      SecureStore.getItemAsync(STORAGE_KEYS.profileName),
    ]);

    useStore.setState({
      address,
      authToken: token,
      isPrivacyMode: privacyMode === 'true',
      profileImage,
      profileName,
      sessionRestored: true,
    });
  } catch (e) {
    useStore.setState({ sessionRestored: true });
  }
})();

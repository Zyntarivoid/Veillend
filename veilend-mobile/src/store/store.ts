import { create } from 'zustand';
import { Clipboard } from 'react-native';
import api, { fetchWithRetry } from '../utils/api';
import { getSecureItem, setSecureItem, deleteSecureItem, wipeAllSecureItems, setSecretKeyWithLockPolicy } from '../utils/secureStorage';
import { TX_BUILDERS } from '../lib/soroban/transactions';
import { signTransaction, UserRejectedError } from '../lib/soroban/signer';
import { sendTransaction, pollTransaction } from '../lib/soroban/rpc';
import { parseContractErrorCode, getContractErrorMessage } from '../lib/soroban/contractErrors';
import { reportError } from '../utils/errorReporting';
import { TimeoutError, withTimeout } from '../utils/withTimeout';

const DASHBOARD_FETCH_TIMEOUT_MS = 15_000;

// Tracks every in-flight fetchPortfolio/fetchTransactions request so
// cancelPendingRequests() can abort them all at once (issue #344) — kept
// module-level rather than in Zustand state since AbortControllers aren't
// meaningful to diff/serialize as store state.
const pendingRequestControllers = new Set<AbortController>();

/**
 * Creates an AbortController for a single tracked fetch, registers it so
 * cancelPendingRequests() can abort it, and chains an optional
 * caller-supplied signal (e.g. pull-to-refresh-on-unmount) into it so both
 * cancellation paths converge on one controller passed to axios.
 */
function createTrackedRequest(externalSignal?: AbortSignal): AbortController {
  const controller = new AbortController();
  pendingRequestControllers.add(controller);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return controller;
}

function releaseTrackedRequest(controller: AbortController): void {
  pendingRequestControllers.delete(controller);
}

/**
 * Classifies a caught fetch error for Promise.all aggregation: aborts are
 * user/lifecycle-initiated and must not surface as a scary dashboardError,
 * everything else is pushed onto `errors` for the aggregate message.
 * Returns true when the error was an abort.
 */
function classifyFetchError(err: any, label: string, errors: string[]): boolean {
  if (err?.name === 'AbortError' || err?.name === 'CanceledError') {
    return true;
  }
  errors.push(err?.message ?? label);
  return false;
}

type Nullable<T> = T | null;

// Keys used for SecureStore persistence
const PERSIST_KEYS = {
  authToken: 'authToken',
  address: 'address',
  isPrivacyMode: 'isPrivacyMode',
  profileName: 'profileName',
  profileImage: 'profileImage',
  secretKey: 'stellar_secret_key',
  currency: 'currency',
  notificationsEnabled: 'notificationsEnabled',
  backupConfirmed: 'wallet_backup_confirmed',
  sessionId: 'sessionId',

} as const;

type AuthState = {
  address: Nullable<string>;
  authToken: Nullable<string>;
  /** Server-issued session ID returned by POST /auth/verify. Used to call
   *  POST /auth/logout so the server-side session is revoked on logout. */
  sessionId: Nullable<string>;
  setAddress: (address: string | null) => void;
  setAuthToken: (token: string | null) => void;
  logout: () => Promise<void>;
  requestNonce: (walletAddress: string) => Promise<string>;
  verify: (payload: { walletAddress: string; nonce: string; signature: string }) => Promise<string>;
  authLoading: boolean;
  /** True once the gate-state-only load has finished. */
  sessionRestored: boolean;
  /** Called by UnlockGate after a successful biometrics/PIN pass.
   *  Loads the high-value secrets (authToken, address, profile, etc.)
   *  from SecureStore which are NOT read before the gate lifts. */
  triggerHydrationAfterUnlock: () => Promise<void>;
  /** Safe failure mode: wipe all SecureStore entries, route to ConnectWallet. */
  wipeAllLocalState: () => Promise<void>;
  /** Internal flag — true if the full secret-set hydration has been done at
   *  least once since launch or since the last wipe/auto-lock. */
  hydrationCompleted: boolean;
  /** Persist or re-write the stellar_secret_key under the elevated OS-auth
   *  keychain policy whenever biometricsEnabled toggles on. */
  applySecretKeyLockPolicy: (biometricsEnabled: boolean) => Promise<void>;
};

type UiState = {
  isPrivacyMode: boolean;
  profileName: Nullable<string>;
  profileImage: Nullable<string>;
  setProfileName: (name: string | null) => void;
  setProfileImage: (uri: string | null) => void;
  togglePrivacyMode: () => void;
  currency: string;
  notificationsEnabled: boolean;
  setCurrency: (currency: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  expectedNetwork: string;
  currentNetwork: string | null;
  lastProtocolSyncAt: number | null;
  protocolStatusLoading: boolean;
  protocolStatusError: string | null;
  refreshProtocolStatus: () => Promise<void>;
  shieldedLoading: boolean;
  // Connectivity reported by NetworkProvider (NetInfo). `isOnline` defaults
  // to true so the UI does not flash an offline banner before NetInfo resolves.
  isOnline: boolean;
  networkType: string | null;
  isInternetReachable: boolean | null;
  setNetworkState: (state: {
    isOnline: boolean;
    networkType: string | null;
    isInternetReachable: boolean | null;
  }) => void;
};

type LendingKind = 'deposit' | 'withdraw' | 'borrow' | 'repay';

type LendingState = {
  lastLendingTx: Nullable<any>;
  lendingLoading: boolean;
  deposit: (params: { amount: string; asset: string }) => Promise<any>;
  withdraw: (params: { amount: string; asset: string }) => Promise<any>;
  borrow: (params: { amount: string; asset: string }) => Promise<any>;
  repay: (params: { amount: string; asset: string }) => Promise<any>;
};

export type TransactionRecord = {
  id: string;
  type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'transfer';
  amount: number;
  asset: string;
  timestamp: string;
  status: string;
  txHash: string;
  errorReason?: string;
};

/** Asset metadata as returned by GET /assets?supported=true (backend B9). */
export type SupportedAsset = {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
  issuer: string | null;
  contractId: string | null;
  logoUrl: string | null;
  isNative: boolean;
  isSupported: boolean;
};

/** Per-asset protocol position from the indexer (deposited/borrowed in human units). */
export type Position = {
  userAddress: string;
  assetAddress: string;
  deposited: number;
  borrowed: number;
  updatedAt: string;
};

export type AssetBalance = {
  asset: string;
  balance: number;
};

type PortfolioState = {
  balance: number;
  collateralValue: number;
  borrowedValue: number;
  availableToBorrow: number;
  healthFactor: number;
  portfolioLoading: boolean;
  portfolioError: string | null;
  assetBalances: AssetBalance[];
  transactions: TransactionRecord[];
  transactionsLoading: boolean;
  transactionsError: string | null;
  supportedAssets: SupportedAsset[];
  assetsLoading: boolean;
  assetsError: string | null;
  positions: Position[];
  positionsLoading: boolean;
  positionsError: string | null;
  // One-shot dashboard hydration: single loading flag + aggregate error state.
  dashboardLoading: boolean;
  dashboardError: string | null;
  // True once a portfolio/transactions fetch has timed out at least once and
  // not yet been dismissed or recovered by a subsequent successful fetch —
  // drives the dismissible "backend is slow" banner (issue #344).
  backendSlow: boolean;
  // Optimistically-inserted lending transactions (PENDING / CONFIRMED / FAILED).
  pendingTransactions: TransactionRecord[];
  fetchPortfolio: (signal?: AbortSignal) => Promise<void>;
  fetchTransactions: (signal?: AbortSignal) => Promise<void>;
  fetchSupportedAssets: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  hydrateDashboard: () => Promise<void>;
  // Pull-to-refresh: refetches portfolio + transactions concurrently and is
  // abortable so screens can cancel in-flight work on unmount.
  refreshDashboard: (signal?: AbortSignal) => Promise<void>;
  // Aborts every in-flight fetchPortfolio/fetchTransactions request (issue
  // #344) — called when the user cancels the loading spinner, or logs out
  // while a fetch is still in flight, so no stale response can write to
  // state after the session is torn down.
  cancelPendingRequests: () => void;
  dismissBackendSlowNotice: () => void;
};

type StoreState = AuthState & UiState & LendingState & PortfolioState;

/**
 * Indexer amounts are stored as raw 7-decimal-scaled integers; convert to
 * human units the same way the web dashboard does (divide by 1e7).
 */
const parseRawAmount = (raw: string | number | null | undefined): number => {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n / 1e7 : 0;
};

export const useStore = create<StoreState>(
  (set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void, get: () => StoreState) => {
    /**
     * Shared optimistic lending runner used by deposit/withdraw/borrow/repay.
     *
     * Flow:
     *  1. Validate inputs and resolve asset metadata from the supported-assets list.
     *  2. Push a PENDING transaction + apply the optimistic balance delta.
     *  3. Build unsigned XDR via the soroban/transactions module.
     *  4. Sign the XDR with the in-app keypair (or Freighter when bridge is added).
     *  5. Broadcast via Soroban RPC sendTransaction.
     *  6. Poll getTransaction every 2 s up to 60 s.
     *  7. On confirmation: mark CONFIRMED, refresh portfolio/positions/transactions.
     *  8. On any failure: roll back the optimistic delta atomically, mark FAILED.
     */
    const runLending = async (
      kind: LendingKind,
      { amount, asset }: { amount: string; asset: string },
    ): Promise<any> => {
      const numericAmount = parseFloat(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Enter a valid amount greater than zero');
      }
      const addr = get().address;
      if (!addr || !get().authToken) {
        throw new Error('Connect your wallet before submitting transactions');
      }

      // ── (a) Resolve asset metadata from the already-loaded supported assets ──
      const supportedAssets = get().supportedAssets;
      const assetMeta = supportedAssets.find(
        (a) => a.symbol.toUpperCase() === asset.toUpperCase(),
      );
      if (!assetMeta) {
        throw new Error(`Asset "${asset}" is not supported by the protocol.`);
      }
      if (!assetMeta.contractId && !assetMeta.isNative) {
        throw new Error(`Asset "${asset}" has no contract ID configured.`);
      }

      // VeilLend contract ID is injected from env; fall back to a sentinel so
      // the build/test path doesn't hard-crash.
      const veilLendContractId =
        (process.env.VEIL_LEND_CONTRACT_ID as string | undefined) ?? '';
      if (!veilLendContractId) {
        throw new Error('VeilLend contract ID is not configured (VEIL_LEND_CONTRACT_ID).');
      }

      // Double-tap guard: reject if a lending action is already in flight.
      if (get().lendingLoading) {
        throw new Error('A transaction is already in progress. Please wait.');
      }

      const pendingTx: TransactionRecord = {
        id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: kind,
        amount: numericAmount,
        asset,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        txHash: '',
      };

      // Optimistic mutation: surface the tx immediately + bump the balance.
      set((s) => ({
        pendingTransactions: [pendingTx, ...s.pendingTransactions],
        balance: s.balance + optimisticDelta(kind, numericAmount),
        lendingLoading: true,
      }));

      try {
        // ── (b) Build unsigned XDR ───────────────────────────────────────────
        const networkPassphrase =
          (process.env.STELLAR_NETWORK_PASSPHRASE as string | undefined) ??
          'Test SDF Network ; September 2015';

        const unsignedXdr = await TX_BUILDERS[kind]({
          amount,
          decimals: assetMeta.decimals,
          fromAddress: addr,
          contractId: veilLendContractId,
          assetContractId: assetMeta.contractId,
        });

        // ── (c) Sign with in-app keypair (or Freighter when bridge is added) ─
        const signedXdr = await signTransaction(unsignedXdr, networkPassphrase);

        // ── (d) Broadcast to Soroban RPC ─────────────────────────────────────
        const sendResult = await sendTransaction(signedXdr);
        if (sendResult.status === 'ERROR') {
          throw new Error(sendResult.error ?? 'Transaction rejected by node');
        }
        const txHash = sendResult.hash;

        // Update the pending row with the real hash.
        set((s) => ({
          pendingTransactions: s.pendingTransactions.map((t) =>
            t.id === pendingTx.id ? { ...t, txHash } : t,
          ),
        }));

        // ── (e) Poll for confirmation (every 2 s, up to 60 s) ────────────────
        const pollResult = await pollTransaction(txHash);

        if (pollResult.status === 'FAILED') {
          // Try to extract a human-readable contract error.
          const xdrToCheck = pollResult.resultXdr ?? pollResult.errorResultXdr ?? '';
          const errorCode = xdrToCheck ? parseContractErrorCode(xdrToCheck) : null;
          const errorMsg = errorCode !== null
            ? getContractErrorMessage(errorCode)
            : 'Transaction failed on-chain.';
          throw new Error(errorMsg);
        }

        const confirmedTx: TransactionRecord = {
          ...pendingTx,
          status: 'CONFIRMED',
          txHash,
        };

        set((s) => ({
          pendingTransactions: s.pendingTransactions.map((t) =>
            t.id === pendingTx.id ? confirmedTx : t,
          ),
          lastLendingTx: confirmedTx,
          lendingLoading: false,
        }));

        // Upgrade the optimistic delta to the authoritative indexer value.
        // Best-effort: a refresh failure must not fail an already-confirmed tx.
        try {
          await get().fetchPortfolio();
          await get().fetchPositions();
          await get().fetchTransactions();
          await get().refreshProtocolStatus();
        } catch (_e) {
          // authoritative refresh is best-effort
        }

        return confirmedTx;
      } catch (err: any) {
        // Classify the error for appropriate severity + toast messaging.
        const isUserRejection = err instanceof UserRejectedError ||
          err?.name === 'UserRejectedError';
        const isNetworkError =
          !isUserRejection &&
          (err?.message?.toLowerCase().includes('timeout') ||
           err?.message?.toLowerCase().includes('network error') ||
           err?.message?.toLowerCase().includes('fetch'));

        const errorMessage = isUserRejection
          ? 'Transaction rejected'
          : isNetworkError
          ? 'Network error, please retry'
          : (err?.message ?? 'Transaction failed');

        // Report non-rejection errors (user rejections are low severity).
        if (!isUserRejection) {
          reportError(err, {
            severity: isNetworkError ? 'high' : 'medium',
            component: 'runLending',
            metadata: { kind, asset, amount },
          }).catch(() => {});
        }

        // Atomic rollback of the optimistic mutation + FAILED row.
        set((s) => ({
          pendingTransactions: s.pendingTransactions.map((t) =>
            t.id === pendingTx.id
              ? { ...t, status: 'FAILED', errorReason: errorMessage }
              : t,
          ),
          balance: s.balance - optimisticDelta(kind, numericAmount),
          lastLendingTx: { ...pendingTx, status: 'FAILED', errorReason: errorMessage },
          lendingLoading: false,
        }));
        throw Object.assign(err, { message: errorMessage });
      }
    };

    return {
    // Auth
    address: null,
    authToken: null,
    sessionId: null,
    authLoading: false,
    sessionRestored: false,
    hydrationCompleted: false,
    setAddress: (address: string | null) => {
      set({ address });
      try {
        if (address) setSecureItem(PERSIST_KEYS.address, address);
        else deleteSecureItem(PERSIST_KEYS.address);
      } catch (e) {
        // ignore persistence errors
      }
    },
    setAuthToken: (token: string | null) => {
      set({ authToken: token });
      try {
        if (token) setSecureItem(PERSIST_KEYS.authToken, token);
        else deleteSecureItem(PERSIST_KEYS.authToken);
      } catch (e) {
        // ignore persistence errors
      }
    },
    logout: async () => {
      // Abort any in-flight dashboard fetches first (issue #344) so a
      // response that lands after the session is torn down can't write
      // stale data (or log a confusing error) into the post-logout state.
      get().cancelPendingRequests();
      // Attempt to revoke the server-side session before clearing local state.
      // Fire-and-forget: a network failure must NOT block the local logout so
      // the user is never stuck with a locally-live session they cannot clear.
      const { authToken } = get();
      if (authToken) {
        try {
          await api.post('/auth/logout');
        } catch (_e) {
          // Backend revocation is best-effort. The JWT strategy also checks DB
          // session existence, so an un-revoked token simply expires naturally.
        }
      }
      // Clear in-memory state
      set({
        address: null,
        authToken: null,
        sessionId: null,
        isPrivacyMode: false,
        profileName: null,
        profileImage: null,
        currency: 'USD',
        notificationsEnabled: true,
        sessionRestored: true,
        authLoading: false,
        lendingLoading: false,
        shieldedLoading: false,
      });
      // Clear ALL persisted keys to prevent stale data on next launch
      try {
        deleteSecureItem(PERSIST_KEYS.authToken);
        deleteSecureItem(PERSIST_KEYS.address);
        deleteSecureItem(PERSIST_KEYS.sessionId);
        deleteSecureItem(PERSIST_KEYS.isPrivacyMode);
        deleteSecureItem(PERSIST_KEYS.profileName);
        deleteSecureItem(PERSIST_KEYS.profileImage);
        deleteSecureItem(PERSIST_KEYS.secretKey);
        deleteSecureItem(PERSIST_KEYS.currency);
        deleteSecureItem(PERSIST_KEYS.notificationsEnabled);
        deleteSecureItem(PERSIST_KEYS.backupConfirmed);
      } catch (e) {
        // ignore persistence errors
      }
      try {
        Clipboard.setString('');
      } catch (e) {}
    },

    // UI
    isPrivacyMode: false,
    profileName: null,
    profileImage: null,
    setProfileName: (name: string | null) => {
      set({ profileName: name });
      try {
        if (name) setSecureItem(PERSIST_KEYS.profileName, name);
        else deleteSecureItem(PERSIST_KEYS.profileName);
      } catch (e) {
        // ignore persistence errors
      }
    },
    setProfileImage: (uri: string | null) => {
      set({ profileImage: uri });
      try {
        if (uri) setSecureItem(PERSIST_KEYS.profileImage, uri);
        else deleteSecureItem(PERSIST_KEYS.profileImage);
      } catch (e) {
        // ignore persistence errors
      }
    },
    togglePrivacyMode: () => {
      const next = !get().isPrivacyMode;
      set({ isPrivacyMode: next });
      try {
        if (next) {
          setSecureItem(PERSIST_KEYS.isPrivacyMode, 'true');
        } else {
          deleteSecureItem(PERSIST_KEYS.isPrivacyMode);
        }
      } catch (e) {
        // ignore persistence errors
      }
    },
    currency: 'USD',
    notificationsEnabled: true,
    setCurrency: (currency: string) => {
      set({ currency });
      try {
        setSecureItem(PERSIST_KEYS.currency, currency);
      } catch (e) {
        // ignore persistence errors
      }
    },
    setNotificationsEnabled: (enabled: boolean) => {
      set({ notificationsEnabled: enabled });
      try {
        setSecureItem(
          PERSIST_KEYS.notificationsEnabled,
          enabled ? 'true' : 'false',
        );
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
    isOnline: true,
    networkType: null,
    isInternetReachable: null,
    setNetworkState: (state) => set(state),
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
        const sid = res.data?.sessionId || null;
        set({ authLoading: false, authToken: token, address: walletAddress, sessionId: sid });
        try {
          if (token) setSecureItem(PERSIST_KEYS.authToken, token);
          if (sid) setSecureItem(PERSIST_KEYS.sessionId, sid);
        } catch (e) {}
        return token;
      } catch (err: any) {
        set({ authLoading: false });
        // Surface 401/403 as a human-readable error so ConnectWalletScreen
        // can display an inline banner instead of crashing or swallowing it.
        const status = err?.response?.status;
        if (status === 401) {
          throw new Error('Signature verification failed. Please try again.');
        }
        if (status === 403) {
          throw new Error('Access denied. Wallet not authorized.');
        }
        // Nonce already used / expired — friendly message for replay case.
        if (status === 410) {
          throw new Error('Challenge expired. Please request a new one.');
        }
        throw err;
      }
    },

    /**
     * Load every high-value secret from SecureStore. Called ONLY after the
     * unlock gate has passed (biometrics/PIN verified), or immediately on
     * launch if NO lock is enabled. Ensures authToken + stellar_secret_key
     * are never loaded into memory while the gate is still active.
     */
    triggerHydrationAfterUnlock: async () => {
      try {
        const [token, address, privacyMode, profileName, profileImage, currency, notificationsEnabled, sessionId] =
          await Promise.all([
            getSecureItem(PERSIST_KEYS.authToken),
            getSecureItem(PERSIST_KEYS.address),
            getSecureItem(PERSIST_KEYS.isPrivacyMode),
            getSecureItem(PERSIST_KEYS.profileName),
            getSecureItem(PERSIST_KEYS.profileImage),
            getSecureItem(PERSIST_KEYS.currency),
            getSecureItem(PERSIST_KEYS.notificationsEnabled),
            getSecureItem(PERSIST_KEYS.sessionId),
          ]);

        const patch: Partial<AuthState & UiState> = {};
        if (token) (patch as any).authToken = token;
        if (address) (patch as any).address = address;
        if (sessionId) (patch as any).sessionId = sessionId;
        if (privacyMode === 'true') (patch as any).isPrivacyMode = true;
        if (profileName) (patch as any).profileName = profileName;
        if (profileImage) (patch as any).profileImage = profileImage;
        if (currency) (patch as any).currency = currency;
        if (notificationsEnabled !== null) (patch as any).notificationsEnabled = notificationsEnabled === 'true';

        set({ ...patch, sessionRestored: true, hydrationCompleted: true } as any);
      } catch (e) {
        // Even on failure, mark session as restored so the app doesn't hang
        // on the splash screen forever; ConnectWallet will be shown.
        set({ sessionRestored: true, hydrationCompleted: true });
      }
    },

    /**
     * Wipe EVERY SecureStore entry AND clear all in-memory hot state. Safe
     * failure mode invoked by the "Forgot PIN?" path so users can never be
     * gated forever without recovery.
     */
    wipeAllLocalState: async () => {
      get().cancelPendingRequests();
      // Clear SecureStore first (wipes secrets + gate state together).
      await wipeAllSecureItems();
      // Clear the hot in-memory state so nothing survives to the next render.
      set({
        address: null,
        authToken: null,
        sessionId: null,
        isPrivacyMode: false,
        profileName: null,
        profileImage: null,
        currency: 'USD',
        notificationsEnabled: true,
        sessionRestored: true,
        hydrationCompleted: true,
        authLoading: false,
        lendingLoading: false,
        shieldedLoading: false,
        balance: 0,
        collateralValue: 0,
        borrowedValue: 0,
        availableToBorrow: 0,
        healthFactor: 0,
        assetBalances: [],
        transactions: [],
        positions: [],
        supportedAssets: [],
        pendingTransactions: [],
        portfolioLoading: false,
        transactionsLoading: false,
        dashboardLoading: false,
        dashboardError: null,
        backendSlow: false,
      });
      try {
        Clipboard.setString('');
      } catch (e) {}
    },

    /**
     * Re-writes the stellar_secret_key with the elevated keychain policy
     * (requireAuthentication) whenever the user enables biometrics. If the
     * in-memory copy isn't available, re-reads once from SecureStore first.
     */
    applySecretKeyLockPolicy: async (biometricsEnabled: boolean) => {
      try {
        // Read via the canonical secureStorage wrapper (respects current policy)
        const current = await getSecureItem('stellar_secret_key');
        if (!current) return;
        await setSecretKeyWithLockPolicy(current, biometricsEnabled);
      } catch (e) {
        // Best effort; if no passcode is set the downgrade path inside
        // setSecretKeyWithLockPolicy will still preserve the value.
      }
    },

    // Lending — optimistic updates with atomic rollback on failure
    lastLendingTx: null,
    lendingLoading: false,
    deposit: (params) => runLending('deposit', params),
    withdraw: (params) => runLending('withdraw', params),
    borrow: (params) => runLending('borrow', params),
    repay: (params) => runLending('repay', params),

    // Portfolio state
    balance: 0,
    collateralValue: 0,
    borrowedValue: 0,
    availableToBorrow: 0,
    healthFactor: 0,
    portfolioLoading: false,
    portfolioError: null,
    assetBalances: [],
    transactions: [],
    transactionsLoading: false,
    transactionsError: null,
    supportedAssets: [],
    assetsLoading: false,
    assetsError: null,
    positions: [],
    positionsLoading: false,
    positionsError: null,
    dashboardLoading: false,
    dashboardError: null,
    backendSlow: false,
    pendingTransactions: [],
    fetchPortfolio: async (signal?: AbortSignal) => {
      const addr = get().address;
      if (!addr) return;
      set({ portfolioLoading: true, portfolioError: null });
      const controller = createTrackedRequest(signal);
      try {
        const res = await withTimeout(
          fetchWithRetry(`/portfolios/${addr}`, undefined, { signal: controller.signal }),
          DASHBOARD_FETCH_TIMEOUT_MS,
          'portfolio',
        );
        const data = res.data?.data ?? res.data;
        set({
          balance: data?.balance ?? 0,
          collateralValue: data?.collateralValue ?? 0,
          borrowedValue: data?.borrowedValue ?? 0,
          availableToBorrow: data?.availableToBorrow ?? 0,
          healthFactor: data?.healthFactor ?? 0,
          assetBalances: Array.isArray(data?.balances) ? data.balances : [],
          portfolioLoading: false,
          backendSlow: false,
        });
      } catch (err: any) {
        if (err instanceof TimeoutError) {
          // The underlying axios request has no way to know we've given up
          // on it — abort it for real so it doesn't keep the connection
          // (and, on a stale-write race, the store) busy after we've moved
          // on to showing an error.
          controller.abort();
          set({
            portfolioError: 'Portfolio request timed out. Please retry.',
            portfolioLoading: false,
            backendSlow: true,
          });
          throw err;
        }
        if (err?.name === 'AbortError' || err?.name === 'CanceledError') {
          set({ portfolioLoading: false });
          throw err;
        }
        set({
          portfolioError: err?.message ?? 'Failed to load portfolio',
          portfolioLoading: false,
        });
        throw err;
      } finally {
        releaseTrackedRequest(controller);
      }
    },
    fetchTransactions: async (signal?: AbortSignal) => {
      const addr = get().address;
      if (!addr) return;
      set({ transactionsLoading: true, transactionsError: null });
      const controller = createTrackedRequest(signal);
      try {
        const res = await withTimeout(
          fetchWithRetry(`/transactions/${addr}`, undefined, { signal: controller.signal }),
          DASHBOARD_FETCH_TIMEOUT_MS,
          'transactions',
        );
        const data = res.data?.data ?? res.data;
        set({
          transactions: Array.isArray(data) ? data : [],
          transactionsLoading: false,
          backendSlow: false,
        });
      } catch (err: any) {
        if (err instanceof TimeoutError) {
          controller.abort();
          set({
            transactionsError: 'Transactions request timed out. Please retry.',
            transactionsLoading: false,
            backendSlow: true,
          });
          throw err;
        }
        if (err?.name === 'AbortError' || err?.name === 'CanceledError') {
          set({ transactionsLoading: false });
          throw err;
        }
        set({
          transactionsError: err?.message ?? 'Failed to load transactions',
          transactionsLoading: false,
        });
        throw err;
      } finally {
        releaseTrackedRequest(controller);
      }
    },
    fetchSupportedAssets: async () => {
      set({ assetsLoading: true, assetsError: null });
      try {
        // Backend B9: supported (configured) assets.
        const res = await api.get('/assets', { params: { supported: true } });
        const data = res.data?.data ?? res.data;
        set({
          supportedAssets: Array.isArray(data) ? data : [],
          assetsLoading: false,
        });
      } catch (err: any) {
        set({
          assetsError: err?.message ?? 'Failed to load supported assets',
          assetsLoading: false,
        });
        throw err;
      }
    },
    fetchPositions: async () => {
      const addr = get().address;
      if (!addr) return;
      set({ positionsLoading: true, positionsError: null });
      try {
        const res = await api.get(`/indexer/positions/${addr}`);
        const data = res.data?.positions ?? res.data?.data?.positions;
        const rows = Array.isArray(data) ? data : [];
        const positions: Position[] = rows.map((p: any) => ({
          userAddress: p.userAddress ?? addr,
          assetAddress: p.assetAddress ?? '',
          deposited: parseRawAmount(p.deposited ?? p.depositedAmount),
          borrowed: parseRawAmount(p.borrowed ?? p.borrowedAmount),
          updatedAt: p.updatedAt ?? new Date().toISOString(),
        }));
        set({ positions, positionsLoading: false });
      } catch (err: any) {
        set({
          positionsError: err?.message ?? 'Failed to load positions',
          positionsLoading: false,
        });
        throw err;
      }
    },
    hydrateDashboard: async () => {
      const addr = get().address;
      if (!addr) {
        set({ dashboardLoading: false });
        return;
      }
      set({ dashboardLoading: true, dashboardError: null });
      let aborted = false;
      const errors: string[] = [];
      await Promise.all([
        get()
          .fetchSupportedAssets()
          .catch((e: any) => {
            if (classifyFetchError(e, 'assets', errors)) aborted = true;
          }),
        get()
          .fetchPortfolio()
          .catch((e: any) => {
            if (classifyFetchError(e, 'portfolio', errors)) aborted = true;
          }),
        get()
          .fetchPositions()
          .catch((e: any) => {
            if (classifyFetchError(e, 'positions', errors)) aborted = true;
          }),
        get()
          .fetchTransactions()
          .catch((e: any) => {
            if (classifyFetchError(e, 'transactions', errors)) aborted = true;
          }),
      ]);
      set({
        dashboardLoading: false,
        // A user-triggered cancel (cancelPendingRequests, e.g. tapping
        // "Cancel Loading" or logging out mid-fetch) must not surface as an
        // error — the user asked for exactly this outcome.
        dashboardError: errors.length && !aborted ? errors.join('; ') : null,
      });
    },
    refreshDashboard: async (signal?: AbortSignal) => {
      const addr = get().address;
      if (!addr) {
        set({ dashboardLoading: false });
        return;
      }
      set({ dashboardLoading: true, dashboardError: null });
      let aborted = false;
      const errors: string[] = [];
      await Promise.all([
        get()
          .fetchPortfolio(signal)
          .catch((e: any) => {
            if (classifyFetchError(e, 'portfolio', errors)) aborted = true;
          }),
        get()
          .fetchTransactions(signal)
          .catch((e: any) => {
            if (classifyFetchError(e, 'transactions', errors)) aborted = true;
          }),
      ]);
      set({
        dashboardLoading: false,
        dashboardError: errors.length && !aborted ? errors.join('; ') : null,
      });
    },
    cancelPendingRequests: () => {
      pendingRequestControllers.forEach((controller) => controller.abort());
      pendingRequestControllers.clear();
    },
    dismissBackendSlowNotice: () => set({ backendSlow: false }),
  };
  });

/** Optimistic balance delta per lending kind. */
const optimisticDelta = (kind: LendingKind, amount: number): number => {
  switch (kind) {
    case 'deposit':
    case 'borrow':
      return amount;
    case 'withdraw':
    case 'repay':
      return -amount;
  }
};

// ──────────────────────────────────────────────
// Two-phase launch hydration:
//
//  Phase 1 (gate-state only, runs immediately):
//    Read only the applock.* keys from SecureStore (never OS-auth protected)
//    so useAppLock (mounted below in AppLockProvider) can render the gate.
//
//  Phase 2 (full secrets, gated on unlock):
//    If NO lock is enabled → immediately proceed to full secret hydration right now.
//    If a lock IS enabled → defer; full hydration happens later inside
//    UnlockGate calling triggerHydrationAfterUnlock() AFTER the user passes
//    biometrics or a correct PIN.
// ──────────────────────────────────────────────
(async () => {
  try {
    const [bioRaw, pinHashRaw] = await Promise.all([
      getSecureItem('applock.biometricsEnabled'),
      getSecureItem('applock.pinHash'),
    ]);
    const biometricsEnabled = bioRaw === 'true';
    const pinEnabled = !!pinHashRaw;
    const anyLockEnabled = biometricsEnabled || pinEnabled;

    if (!anyLockEnabled) {
      // No lock → straight to full secret hydration (no gate to show).
      await useStore.getState().triggerHydrationAfterUnlock();
      useStore.setState({ sessionRestored: true });
    } else {
      // Lock active: mark gate-state as loaded (so the splash goes away and
      // UnlockGate mounts, which reads the gate-state to render the prompt).
      useStore.setState({ sessionRestored: true, hydrationCompleted: false });
    }
  } catch (e) {
    // On any SecureStore boot failure, still mark sessionRestored so we
    // don't hang on the splash. The user can still manually ConnectWallet
    // (gate-state isn't readable but secrets definitely locked out can't proceed till
    // then.
    useStore.setState({ sessionRestored: true });
  }
})();

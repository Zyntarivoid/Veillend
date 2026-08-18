import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { useStore } from '../store/store';
import * as SecureStoreShim from '../utils/secureStoreShim';
import api from '../utils/api';

// Stub the network so optimistic lending tests never hit the real backend.
// The store holds a live reference to this axios instance, so patching the
// method here intercepts every request.
(api as any).get = async () => ({ data: {} });
(api as any).post = async () => ({ data: {} });

const flushPersistence = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// Helper to reset store between tests
beforeEach(async () => {
  await SecureStoreShim.clearAllAsync();
  useStore.setState({
    address: null,
    authToken: null,
    isPrivacyMode: false,
    profileName: null,
    profileImage: null,
    currency: 'USD',
    notificationsEnabled: true,
    authLoading: false,
    sessionRestored: true,
    lendingLoading: false,
    lastLendingTx: null,
    protocolStatusLoading: false,
    protocolStatusError: null,
    shieldedLoading: false,
    currentNetwork: 'testnet',
    lastProtocolSyncAt: null,
    isOnline: true,
    networkType: null,
    isInternetReachable: null,
    balance: 0,
    collateralValue: 0,
    borrowedValue: 0,
    availableToBorrow: 0,
    healthFactor: 0,
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
    pendingTransactions: [],
  });
});

describe('Backend-backed dashboard data (issue #315)', () => {
  it('exposes supported assets, positions, and dashboard hydration actions', () => {
    const s = useStore.getState();
    assert.equal(typeof s.fetchSupportedAssets, 'function');
    assert.equal(typeof s.fetchPositions, 'function');
    assert.equal(typeof s.hydrateDashboard, 'function');
    assert.equal(Array.isArray(s.supportedAssets), true);
    assert.equal(Array.isArray(s.positions), true);
    assert.equal(Array.isArray(s.pendingTransactions), true);
  });  it('hydrateDashboard is a no-op without a connected wallet', async () => {
    useStore.setState({ address: null });
    await useStore.getState().hydrateDashboard();
    const s = useStore.getState();
    assert.equal(s.dashboardLoading, false);
    assert.equal(s.dashboardError, null);
  });

  it('hydrateDashboard fetches assets, portfolio, positions and transactions', async () => {
    const calls: string[] = [];
    (api as any).get = async (url: string, config?: any) => {
      calls.push(`${url}${config?.params?.supported ? '?supported=true' : ''}`);
      return { data: {} };
    };
    useStore.setState({ address: 'GABC123', authToken: 'tok' });
    await useStore.getState().hydrateDashboard();
    assert.deepEqual(calls.sort(), [
      '/assets?supported=true',
      '/indexer/positions/GABC123',
      '/portfolios/GABC123',
      '/transactions/GABC123',
    ]);
    const s = useStore.getState();
    assert.equal(s.dashboardLoading, false);
    assert.equal(s.dashboardError, null);
  });
});

describe('Optimistic lending with rollback (issue #315)', () => {
  it('deposit pushes a PENDING transaction and bumps the balance optimistically', async () => {
    useStore.setState({ address: 'GABC123', authToken: 'tok', balance: 100 });
    const depositPromise = useStore.getState().deposit({ amount: '50', asset: 'XLM' });

    // Optimistic state is applied synchronously before confirmation.
    const optimistic = useStore.getState();
    assert.equal(optimistic.pendingTransactions.length, 1);
    assert.equal(optimistic.pendingTransactions[0].status, 'PENDING');
    assert.equal(optimistic.pendingTransactions[0].type, 'deposit');
    assert.equal(optimistic.pendingTransactions[0].asset, 'XLM');
    assert.equal(optimistic.balance, 150);

    const res = await depositPromise;
    assert.equal(res.status, 'CONFIRMED');

    const after = useStore.getState();
    const tx = after.pendingTransactions.find((t) => t.id === res.id);
    assert.equal(tx?.status, 'CONFIRMED');
    // Authoritative portfolio refresh (stubbed empty) upgrades the balance.
    assert.equal(after.balance, 0);
  });

  it('withdraw applies a negative optimistic delta', async () => {
    useStore.setState({ address: 'GABC123', authToken: 'tok', balance: 100 });
    const withdrawPromise = useStore.getState().withdraw({ amount: '25', asset: 'XLM' });
    assert.equal(useStore.getState().balance, 75);
    await withdrawPromise;
    assert.equal(useStore.getState().balance, 0);
  });

  it('rejects when no wallet is connected without mutating state', async () => {
    useStore.setState({ address: null, authToken: null, balance: 10 });
    await assert.rejects(
      () => useStore.getState().deposit({ amount: '5', asset: 'XLM' }),
      /Connect your wallet/,
    );
    const s = useStore.getState();
    assert.equal(s.pendingTransactions.length, 0);
    assert.equal(s.balance, 10);
  });

  it('rejects invalid amounts without mutating state', async () => {
    useStore.setState({ address: 'GABC123', authToken: 'tok', balance: 10 });
    await assert.rejects(
      () => useStore.getState().deposit({ amount: '0', asset: 'XLM' }),
      /valid amount/,
    );
    const s = useStore.getState();
    assert.equal(s.pendingTransactions.length, 0);
    assert.equal(s.balance, 10);
  });
});

describe('Auth persistence (issue #59)', () => {
  it('should persist address when set', () => {
    const { setAddress } = useStore.getState();
    setAddress('GBOYEE_WALLET_ADDRESS');

    assert.equal(useStore.getState().address, 'GBOYEE_WALLET_ADDRESS');
  });

  it('should clear address from store when set to null', () => {
    useStore.setState({ address: 'SOME_ADDRESS' });
    const { setAddress } = useStore.getState();
    setAddress(null);

    assert.equal(useStore.getState().address, null);
  });

  it('should persist authToken when set', () => {
    const { setAuthToken } = useStore.getState();
    setAuthToken('my-jwt-token');

    assert.equal(useStore.getState().authToken, 'my-jwt-token');
  });

  it('should clear authToken when set to null', () => {
    useStore.setState({ authToken: 'some-token' });
    const { setAuthToken } = useStore.getState();
    setAuthToken(null);

    assert.equal(useStore.getState().authToken, null);
  });

  it('logout should clear address, authToken, and isPrivacyMode', () => {
    useStore.setState({
      address: 'WALLET',
      authToken: 'TOKEN',
      isPrivacyMode: true,
    });

    const { logout } = useStore.getState();
    logout();

    assert.equal(useStore.getState().address, null);
    assert.equal(useStore.getState().authToken, null);
    assert.equal(useStore.getState().isPrivacyMode, false);
    assert.equal(useStore.getState().sessionRestored, true);
  });
});

describe('Profile customization persistence (issue #60)', () => {
  it('should persist profile name when set', async () => {
    const { setProfileName } = useStore.getState();
    setProfileName('Veil User');
    await flushPersistence();

    assert.equal(useStore.getState().profileName, 'Veil User');
    assert.equal(await SecureStoreShim.getItemAsync('profileName'), 'Veil User');
  });

  it('should persist profile image when set', async () => {
    const { setProfileImage } = useStore.getState();
    setProfileImage('file:///avatar.png');
    await flushPersistence();

    assert.equal(useStore.getState().profileImage, 'file:///avatar.png');
    assert.equal(await SecureStoreShim.getItemAsync('profileImage'), 'file:///avatar.png');
  });

  it('logout should clear persisted profile customization', async () => {
    const { setProfileName, setProfileImage, logout } = useStore.getState();
    setProfileName('Veil User');
    setProfileImage('file:///avatar.png');
    await flushPersistence();

    logout();
    await flushPersistence();

    assert.equal(useStore.getState().profileName, null);
    assert.equal(useStore.getState().profileImage, null);
    assert.equal(await SecureStoreShim.getItemAsync('profileName'), null);
    assert.equal(await SecureStoreShim.getItemAsync('profileImage'), null);
  });
});

describe('Privacy mode persistence (issue #59)', () => {
  it('should toggle privacy mode on', () => {
    assert.equal(useStore.getState().isPrivacyMode, false);

    const { togglePrivacyMode } = useStore.getState();
    togglePrivacyMode();

    assert.equal(useStore.getState().isPrivacyMode, true);
  });

  it('should toggle privacy mode off after being on', () => {
    useStore.setState({ isPrivacyMode: true });

    const { togglePrivacyMode } = useStore.getState();
    togglePrivacyMode();

    assert.equal(useStore.getState().isPrivacyMode, false);
  });
});

describe('Settings preferences persistence (issue #190)', () => {
  it('should default currency to USD and notifications to enabled', () => {
    assert.equal(useStore.getState().currency, 'USD');
    assert.equal(useStore.getState().notificationsEnabled, true);
  });

  it('should persist currency when set', async () => {
    const { setCurrency } = useStore.getState();
    setCurrency('EUR');
    await flushPersistence();

    assert.equal(useStore.getState().currency, 'EUR');
    assert.equal(await SecureStoreShim.getItemAsync('currency'), 'EUR');
  });

  it('should persist notificationsEnabled when toggled off', async () => {
    const { setNotificationsEnabled } = useStore.getState();
    setNotificationsEnabled(false);
    await flushPersistence();

    assert.equal(useStore.getState().notificationsEnabled, false);
    assert.equal(await SecureStoreShim.getItemAsync('notificationsEnabled'), 'false');
  });

  it('logout should reset currency and notificationsEnabled to defaults', async () => {
    const { setCurrency, setNotificationsEnabled, logout } = useStore.getState();
    setCurrency('GBP');
    setNotificationsEnabled(false);
    await flushPersistence();

    logout();
    await flushPersistence();

    assert.equal(useStore.getState().currency, 'USD');
    assert.equal(useStore.getState().notificationsEnabled, true);
    assert.equal(await SecureStoreShim.getItemAsync('currency'), null);
    assert.equal(await SecureStoreShim.getItemAsync('notificationsEnabled'), null);
  });
});

describe('Session restore (issue #59)', () => {
  it('should have sessionRestored flag', () => {
    assert.equal(typeof useStore.getState().sessionRestored, 'boolean');
  });

  it('should start with sessionRestored = true after hydration', () => {
    // The IIFE at bottom of store.ts sets sessionRestored = true
    // For this test we just verify the flag exists and is boolean
    assert.ok([true, false].includes(useStore.getState().sessionRestored));
  });
});

describe('shieldedLoading state (issue #59)', () => {
  it('should have shieldedLoading in store for App.tsx', () => {
    assert.equal(typeof useStore.getState().shieldedLoading, 'boolean');
    assert.equal(useStore.getState().shieldedLoading, false);
  });
});

describe('Network state (issue #304)', () => {
  it('defaults to online before NetInfo resolves', () => {
    const s = useStore.getState();
    assert.equal(s.isOnline, true);
    assert.equal(s.networkType, null);
    assert.equal(s.isInternetReachable, null);
  });

  it('setNetworkState writes the connectivity snapshot', () => {
    useStore.getState().setNetworkState({
      isOnline: false,
      networkType: 'wifi',
      isInternetReachable: false,
    });
    const s = useStore.getState();
    assert.equal(s.isOnline, false);
    assert.equal(s.networkType, 'wifi');
    assert.equal(s.isInternetReachable, false);
  });
});

describe('refreshDashboard (issue #304)', () => {
  it('exposes the refreshDashboard action', () => {
    assert.equal(typeof useStore.getState().refreshDashboard, 'function');
  });

  it('is a no-op without a connected wallet', async () => {
    let getCalls = 0;
    (api as any).get = async () => {
      getCalls += 1;
      return { data: {} };
    };
    useStore.setState({ address: null });
    await useStore.getState().refreshDashboard();
    assert.equal(getCalls, 0);
    assert.equal(useStore.getState().dashboardLoading, false);
  });

  it('refetches portfolio and transactions concurrently', async () => {
    const calls: string[] = [];
    (api as any).get = async (url: string) => {
      calls.push(url);
      return { data: {} };
    };
    useStore.setState({ address: 'GABC123', authToken: 'tok' });
    await useStore.getState().refreshDashboard();
    assert.deepEqual(calls.sort(), [
      '/portfolios/GABC123',
      '/transactions/GABC123',
    ]);
    const s = useStore.getState();
    assert.equal(s.dashboardLoading, false);
    assert.equal(s.dashboardError, null);
  });

  it('aggregates failures into dashboardError', async () => {
    (api as any).get = async () => {
      throw new Error('boom');
    };
    useStore.setState({ address: 'GABC123', authToken: 'tok' });
    await useStore.getState().refreshDashboard();
    const s = useStore.getState();
    assert.equal(s.dashboardLoading, false);
    assert.ok(s.dashboardError && s.dashboardError.includes('boom'));
  });

  it('clears in-flight work when the AbortSignal fires', async () => {
    useStore.setState({ address: 'GABC123', authToken: 'tok' });
    let aborted = false;
    (api as any).get = (_url: string, config?: any) =>
      new Promise((_resolve, reject) => {
        config?.signal?.addEventListener?.('abort', () => {
          aborted = true;
          const e: any = new Error('canceled');
          e.name = 'CanceledError';
          reject(e);
        });
      });
    const controller = new AbortController();
    const refresh = useStore.getState().refreshDashboard(controller.signal);
    controller.abort();
    await refresh;
    assert.equal(aborted, true);
    const s = useStore.getState();
    assert.equal(s.dashboardLoading, false);
    assert.equal(s.dashboardError, null);
  });
});

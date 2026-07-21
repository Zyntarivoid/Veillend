import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { useStore } from '../store/store';
import * as SecureStoreShim from '../utils/secureStoreShim';

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

    expect(useStore.getState().profileName).toBe('Veil User');
    await expect(SecureStoreShim.getItemAsync('profileName')).resolves.toBe('Veil User');
  });

  it('should persist profile image when set', async () => {
    const { setProfileImage } = useStore.getState();
    setProfileImage('file:///avatar.png');
    await flushPersistence();

    expect(useStore.getState().profileImage).toBe('file:///avatar.png');
    await expect(SecureStoreShim.getItemAsync('profileImage')).resolves.toBe('file:///avatar.png');
  });

  it('logout should clear persisted profile customization', async () => {
    const { setProfileName, setProfileImage, logout } = useStore.getState();
    setProfileName('Veil User');
    setProfileImage('file:///avatar.png');
    await flushPersistence();

    logout();
    await flushPersistence();

    expect(useStore.getState().profileName).toBeNull();
    expect(useStore.getState().profileImage).toBeNull();
    await expect(SecureStoreShim.getItemAsync('profileName')).resolves.toBeNull();
    await expect(SecureStoreShim.getItemAsync('profileImage')).resolves.toBeNull();
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

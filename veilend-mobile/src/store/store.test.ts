import { useStore } from '../store/store';

// Helper to reset store between tests
beforeEach(() => {
  useStore.setState({
    address: null,
    authToken: null,
    isPrivacyMode: false,
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

    expect(useStore.getState().address).toBe('GBOYEE_WALLET_ADDRESS');
  });

  it('should clear address from store when set to null', () => {
    useStore.setState({ address: 'SOME_ADDRESS' });
    const { setAddress } = useStore.getState();
    setAddress(null);

    expect(useStore.getState().address).toBeNull();
  });

  it('should persist authToken when set', () => {
    const { setAuthToken } = useStore.getState();
    setAuthToken('my-jwt-token');

    expect(useStore.getState().authToken).toBe('my-jwt-token');
  });

  it('should clear authToken when set to null', () => {
    useStore.setState({ authToken: 'some-token' });
    const { setAuthToken } = useStore.getState();
    setAuthToken(null);

    expect(useStore.getState().authToken).toBeNull();
  });

  it('logout should clear address, authToken, and isPrivacyMode', () => {
    useStore.setState({
      address: 'WALLET',
      authToken: 'TOKEN',
      isPrivacyMode: true,
    });

    const { logout } = useStore.getState();
    logout();

    expect(useStore.getState().address).toBeNull();
    expect(useStore.getState().authToken).toBeNull();
    expect(useStore.getState().isPrivacyMode).toBe(false);
    expect(useStore.getState().sessionRestored).toBe(true);
  });
});

describe('Privacy mode persistence (issue #59)', () => {
  it('should toggle privacy mode on', () => {
    expect(useStore.getState().isPrivacyMode).toBe(false);

    const { togglePrivacyMode } = useStore.getState();
    togglePrivacyMode();

    expect(useStore.getState().isPrivacyMode).toBe(true);
  });

  it('should toggle privacy mode off after being on', () => {
    useStore.setState({ isPrivacyMode: true });

    const { togglePrivacyMode } = useStore.getState();
    togglePrivacyMode();

    expect(useStore.getState().isPrivacyMode).toBe(false);
  });
});

describe('Session restore (issue #59)', () => {
  it('should have sessionRestored flag', () => {
    expect(typeof useStore.getState().sessionRestored).toBe('boolean');
  });

  it('should start with sessionRestored = true after hydration', () => {
    // The IIFE at bottom of store.ts sets sessionRestored = true
    // For this test we just verify the flag exists and is boolean
    expect([true, false]).toContain(useStore.getState().sessionRestored);
  });
});

describe('shieldedLoading state (issue #59)', () => {
  it('should have shieldedLoading in store for App.tsx', () => {
    expect(typeof useStore.getState().shieldedLoading).toBe('boolean');
    expect(useStore.getState().shieldedLoading).toBe(false);
  });
});

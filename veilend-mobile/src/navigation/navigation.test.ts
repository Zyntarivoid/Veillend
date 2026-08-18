import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { navigationRef } from './navigationRef';
import { useStore } from '../store/store';

beforeEach(() => {
  // ensure store is in a known state
  useStore.setState({ address: null, authToken: null, sessionRestored: true });
});

describe('Navigation reset on logout', () => {
  it('navigationRef.reset sets current route to ConnectWallet', () => {
    navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });
    const route = navigationRef.getCurrentRoute?.();
    assert.equal(route?.name, 'ConnectWallet');
  });

  it('logout + reset results in cleared auth and ConnectWallet route', () => {
    useStore.setState({ address: 'GABC', authToken: 'tok' });
    const { logout } = useStore.getState();
    logout();

    // screens call navigationRef.reset after logout; emulate that here
    navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });

    const route = navigationRef.getCurrentRoute?.();
    assert.equal(route?.name, 'ConnectWallet');
    assert.equal(useStore.getState().address, null);
    assert.equal(useStore.getState().authToken, null);
  });
});

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { navigationRef } from './navigationRef';
import { useStore } from '../store/store';
import api from '../utils/api';

// Stub the network so logout() never fires a real HTTP call in this test file.
// Without this, the async POST /auth/logout escapes the test boundary and
// triggers __DEV__ ReferenceError from React Native internals in Node.
(api as any).post = async () => ({ data: {} });

beforeEach(() => {
  // ensure store is in a known state
  useStore.setState({ address: null, authToken: null, sessionRestored: true } as any);
});

describe('Navigation reset on logout', () => {
  it('navigationRef.reset sets current route to ConnectWallet', () => {
    navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });
    const route = navigationRef.getCurrentRoute?.();
    assert.equal(route?.name, 'ConnectWallet');
  });

  it('logout + reset results in cleared auth and ConnectWallet route', async () => {
    useStore.setState({ address: 'GABC', authToken: 'tok' } as any);
    const { logout } = useStore.getState();
    await logout();

    // screens call navigationRef.reset after logout; emulate that here
    navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });

    const route = navigationRef.getCurrentRoute?.();
    assert.equal(route?.name, 'ConnectWallet');
    assert.equal(useStore.getState().address, null);
    assert.equal(useStore.getState().authToken, null);
  });
});

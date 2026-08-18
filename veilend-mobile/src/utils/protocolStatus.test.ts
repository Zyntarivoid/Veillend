import assert from 'node:assert/strict';
import test from 'node:test';
import { getProtocolStatusBanners } from './protocolStatus';

test('reports recoverable protocol status banners in priority order', () => {
  const banners = getProtocolStatusBanners({
    expectedNetwork: 'testnet',
    currentNetwork: 'mainnet',
    walletConnected: false,
    lastSyncedAt: 1_000,
    now: 181_000,
  });

  assert.deepEqual(
    banners.map((banner) => ({
      id: banner.id,
      title: banner.title,
      actionLabel: banner.actionLabel,
    })),
    [
      {
        id: 'wallet-disconnected',
        title: 'Wallet disconnected',
        actionLabel: 'Reconnect',
      },
      {
        id: 'network-mismatch',
        title: 'Wrong Stellar network',
        actionLabel: 'Check network',
      },
      {
        id: 'sync-lag',
        title: 'Sync delayed',
        actionLabel: 'Retry sync',
      },
    ],
  );
});

test('does not report banners when wallet, network, and sync state are healthy', () => {
  const banners = getProtocolStatusBanners({
    expectedNetwork: 'testnet',
    currentNetwork: 'testnet',
    walletConnected: true,
    lastSyncedAt: 120_000,
    now: 150_000,
  });

  assert.deepEqual(banners, []);
});

test('reports an offline banner with no action when the device is offline', () => {
  const banners = getProtocolStatusBanners({
    expectedNetwork: 'testnet',
    currentNetwork: 'testnet',
    walletConnected: true,
    isOnline: false,
  });

  assert.equal(banners.length, 1);
  assert.equal(banners[0].id, 'offline');
  assert.equal(banners[0].severity, 'danger');
  assert.equal(banners[0].title, 'No Internet Connection');
  assert.equal(banners[0].actionLabel, undefined);
});

test('offline banner takes priority over other protocol banners', () => {
  const banners = getProtocolStatusBanners({
    expectedNetwork: 'testnet',
    currentNetwork: 'mainnet',
    walletConnected: false,
    isOnline: false,
  });

  assert.equal(banners[0].id, 'offline');
  assert.equal(banners[0].actionLabel, undefined);
});

test('does not report an offline banner when online (default)', () => {
  const banners = getProtocolStatusBanners({
    expectedNetwork: 'testnet',
    currentNetwork: 'testnet',
    walletConnected: true,
  });

  assert.equal(banners.some((b) => b.id === 'offline'), false);
});

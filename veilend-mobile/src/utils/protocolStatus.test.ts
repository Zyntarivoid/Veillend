import { getProtocolStatusBanners } from './protocolStatus';

describe('protocolStatus', () => {
  it('reports recoverable protocol status banners in priority order', () => {
    const banners = getProtocolStatusBanners({
      expectedNetwork: 'testnet',
      currentNetwork: 'mainnet',
      walletConnected: false,
      lastSyncedAt: 1_000,
      now: 181_000,
    });

    expect(
      banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        actionLabel: banner.actionLabel,
      }))
    ).toEqual([
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
    ]);
  });

  it('does not report banners when wallet, network, and sync state are healthy', () => {
    const banners = getProtocolStatusBanners({
      expectedNetwork: 'testnet',
      currentNetwork: 'testnet',
      walletConnected: true,
      lastSyncedAt: 120_000,
      now: 150_000,
    });

    expect(banners).toEqual([]);
  });
});


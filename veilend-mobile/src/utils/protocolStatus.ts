export type ProtocolStatusInput = {
  expectedNetwork: string;
  currentNetwork?: string | null;
  walletConnected: boolean;
  lastSyncedAt?: number | null;
  now?: number;
  maxSyncLagMs?: number;
};

export type ProtocolStatusBannerId =
  | 'wallet-disconnected'
  | 'network-mismatch'
  | 'sync-lag';

export type ProtocolStatusBanner = {
  id: ProtocolStatusBannerId;
  severity: 'warning' | 'danger';
  title: string;
  message: string;
  actionLabel: string;
};

const DEFAULT_SYNC_LAG_MS = 120_000;

/**
 * Builds the ordered set of protocol health warnings shown in the mobile app.
 * Keep this pure so status-priority rules can be tested without rendering React Native.
 */
export function getProtocolStatusBanners({
  expectedNetwork,
  currentNetwork,
  walletConnected,
  lastSyncedAt,
  now = Date.now(),
  maxSyncLagMs = DEFAULT_SYNC_LAG_MS,
}: ProtocolStatusInput): ProtocolStatusBanner[] {
  const banners: ProtocolStatusBanner[] = [];
  const normalizedExpected = expectedNetwork.trim().toLowerCase();
  const normalizedCurrent = currentNetwork?.trim().toLowerCase();

  if (!walletConnected) {
    banners.push({
      id: 'wallet-disconnected',
      severity: 'danger',
      title: 'Wallet disconnected',
      message: 'Reconnect your wallet to continue lending and repayment actions.',
      actionLabel: 'Reconnect',
    });
  }

  if (normalizedCurrent && normalizedCurrent !== normalizedExpected) {
    banners.push({
      id: 'network-mismatch',
      severity: 'warning',
      title: 'Wrong Stellar network',
      message: `Connected to ${currentNetwork}; VeilLend expects ${expectedNetwork}.`,
      actionLabel: 'Check network',
    });
  }

  if (typeof lastSyncedAt === 'number' && now - lastSyncedAt > maxSyncLagMs) {
    banners.push({
      id: 'sync-lag',
      severity: 'warning',
      title: 'Sync delayed',
      message: 'Protocol data may be stale. Refresh status before making a lending decision.',
      actionLabel: 'Retry sync',
    });
  }

  return banners;
}

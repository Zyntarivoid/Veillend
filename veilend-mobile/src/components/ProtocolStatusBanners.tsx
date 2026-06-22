import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getProtocolStatusBanners } from '../utils/protocolStatus';

type ProtocolStatusBannersProps = {
  expectedNetwork: string;
  currentNetwork?: string | null;
  walletConnected: boolean;
  lastSyncedAt?: number | null;
  isRefreshing?: boolean;
  onReconnect: () => void;
  onRetrySync: () => void;
};

export default function ProtocolStatusBanners({
  expectedNetwork,
  currentNetwork,
  walletConnected,
  lastSyncedAt,
  isRefreshing = false,
  onReconnect,
  onRetrySync,
}: ProtocolStatusBannersProps) {
  const banners = getProtocolStatusBanners({
    expectedNetwork,
    currentNetwork,
    walletConnected,
    lastSyncedAt,
  });

  if (banners.length === 0) {
    return null;
  }

  return (
    <View style={styles.stack}>
      {banners.map((banner) => {
        const isWalletBanner = banner.id === 'wallet-disconnected';
        const onPress = isWalletBanner ? onReconnect : onRetrySync;
        const iconName = isWalletBanner ? 'wallet-outline' : 'warning-outline';

        return (
          <View
            key={banner.id}
            style={[
              styles.banner,
              banner.severity === 'danger' ? styles.danger : styles.warning,
            ]}
          >
            <Ionicons name={iconName} size={20} color="#FFFFFF" />
            <View style={styles.copy}>
              <Text style={styles.title}>{banner.title}</Text>
              <Text style={styles.message}>{banner.message}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={banner.actionLabel}
              disabled={isRefreshing && !isWalletBanner}
              onPress={onPress}
              style={styles.action}
            >
              <Text style={styles.actionText}>
                {isRefreshing && !isWalletBanner ? 'Checking...' : banner.actionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
    marginBottom: 18,
  },
  banner: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  danger: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  warning: {
    backgroundColor: '#3B2F0B',
    borderColor: '#EAB308',
    borderWidth: 1,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 16,
  },
  action: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

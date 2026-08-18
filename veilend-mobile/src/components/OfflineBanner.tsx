import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/store';

/**
 * Persistent sticky banner shown at the top of every screen while the device
 * is offline. Reads the connectivity flags written to the store by
 * <NetworkProvider />. Returns null when online so screens can mount it freely.
 */
export default function OfflineBanner() {
  const isOnline = useStore((s) => s.isOnline);
  const isInternetReachable = useStore((s) => s.isInternetReachable);

  if (isOnline && isInternetReachable !== false) {
    return null;
  }

  return (
    <View style={styles.banner} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
      <Text style={styles.text}>No Internet Connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useStore } from '../store/store';
import Toast from '../utils/toast';
import OfflineBanner from './OfflineBanner';

type NetworkProviderProps = {
  children: React.ReactNode;
};

/**
 * Global connectivity provider (issue #304).
 *
 * Subscribes to NetInfo and mirrors the current connectivity snapshot
 * (isOnline, type, isInternetReachable) into the Zustand store so any screen,
 * banner, or action can react to offline state. On a transition to offline a
 * global toast is shown and a sticky banner is rendered over the whole app.
 */
export default function NetworkProvider({ children }: NetworkProviderProps) {
  const setNetworkState = useStore((s) => s.setNetworkState);
  const netInfo = useNetInfo();
  const wasOnlineRef = useRef<boolean | null>(null);

  useEffect(() => {
    // NetInfo resolves asynchronously; skip the null "unknown" snapshot so we
    // never flash the offline banner before connectivity is actually known.
    if (netInfo.isConnected == null) return;

    const isOnline = netInfo.isConnected === true;

    setNetworkState({
      isOnline,
      networkType: netInfo.type ?? null,
      isInternetReachable: netInfo.isInternetReachable ?? null,
    });

    const wasOnline = wasOnlineRef.current;
    if (wasOnline === true && !isOnline) {
      Toast.show({
        type: 'error',
        text1: 'No Internet Connection',
        text2: 'Check your connection and try again.',
      });
    }
    wasOnlineRef.current = isOnline;
  }, [netInfo.isConnected, netInfo.isInternetReachable, netInfo.type, setNetworkState]);

  return (
    <View style={styles.root}>
      {children}
      <View style={styles.sticky} pointerEvents="none">
        <OfflineBanner />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
  },
});

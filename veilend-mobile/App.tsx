import React, { useEffect } from 'react';
import RootNavigator from './src/navigation';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, View, StyleSheet, ActivityIndicator } from 'react-native';
import Toast from './src/utils/toast';
import { useStore } from './src/store/store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import NetworkProvider from './src/components/NetworkProvider';
import { setupCrashInstrumentation } from './src/utils/errorReporting';
import { AppLockProvider, useAppLockContext } from './src/providers/AppLockProvider';
import UnlockGate from './src/screens/UnlockGate';

// Install global crash handlers once on module load
setupCrashInstrumentation();

function LockGateOverlay() {
  const { state } = useAppLockContext();
  if (state.loading) return null;
  if (!state.anyLockEnabled) return null;
  if (!state.isLocked) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100000,
      }}
      pointerEvents="auto"
    >
      <UnlockGate />
    </View>
  );
}

function AppInner() {
  const authLoading = useStore((s) => s.authLoading);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const shieldedLoading = useStore((s) => s.shieldedLoading);
  const anyLoading = authLoading || lendingLoading || shieldedLoading;

  useEffect(() => {
    if (anyLoading) {
      AccessibilityInfo.announceForAccessibility('Loading, please wait');
    }
  }, [anyLoading]);

  return (
    <>
      <RootNavigator />
      <StatusBar style="light" />

      {anyLoading && (
        <View
          style={styles.loadingOverlay}
          pointerEvents="none"
          accessibilityViewIsModal={true}
          accessibilityLabel="Loading, please wait"
          accessibilityRole="progressbar"
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Toast />

      {/* App unlock gate: renders ABOVE the nav + loading + toast so the user
          cannot interact with the app until they authenticate. Only present
          while state.isLocked — unmounts entirely once unlocked so its state
          (e.g. PIN digits entered) is cleared between locks. */}
      <LockGateOverlay />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary component="App">
        <NetworkProvider>
          <AppLockProvider>
            <View style={styles.container}>
              <AppInner />
            </View>
          </AppLockProvider>
        </NetworkProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
});

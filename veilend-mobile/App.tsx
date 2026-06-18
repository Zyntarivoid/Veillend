import React from 'react';
import RootNavigator from './src/navigation';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Toast from './src/utils/toast';
import { useStore } from './src/store/store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const authLoading = useStore((s) => s.authLoading);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const shieldedLoading = useStore((s) => s.shieldedLoading);
  const anyLoading = authLoading || lendingLoading || shieldedLoading;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <RootNavigator />
        <StatusBar style="light" />

        {anyLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        <Toast />
      </View>
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

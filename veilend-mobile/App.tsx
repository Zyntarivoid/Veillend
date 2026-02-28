import React from 'react';
import { StarknetConfig, jsonRpcProvider } from "@starknet-react/core";
import { sepolia } from "@starknet-react/chains";
import { InjectedConnector } from "starknetkit/injected";
import { ArgentMobileConnector } from "starknetkit/argentMobile";
import { WebWalletConnector } from "starknetkit/webwallet";
import RootNavigator from './src/navigation';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Toast from './src/utils/toast';
import { useStore } from './src/store/store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from "react-native-reanimated";

const chains = [sepolia];
const provider = jsonRpcProvider({ rpc: (chain) => ({ nodeUrl: 'https://starknet-sepolia.public.blastapi.io' }) });
const connectors = [
  new InjectedConnector({ options: { id: "argentX" } }),
  new InjectedConnector({ options: { id: "braavos" } }),
  new ArgentMobileConnector(),
  new WebWalletConnector({ url: "https://web.argent.xyz" }),
];

export default function App() {
  const authLoading = useStore((s) => s.authLoading);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const shieldedLoading = useStore((s) => s.shieldedLoading);
  const anyLoading = authLoading || lendingLoading || shieldedLoading;

  return (
    <StarknetConfig chains={chains} provider={provider} connectors={connectors as any} autoConnect>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <RootNavigator />
          <StatusBar style="light" />

          {/* Global Loading Overlay */}
          {anyLoading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          <Toast />
        </View>
      </GestureHandlerRootView>
    </StarknetConfig>
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

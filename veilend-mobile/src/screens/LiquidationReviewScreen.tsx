import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { sendTransaction, simulateTransaction } from '../lib/soroban/rpc';
import { signTransaction } from '../lib/soroban/signer';
import Toast from '../utils/toast';

export default function LiquidationReviewScreen({ route, navigation }: any) {
  const opportunity = route?.params?.opportunity;
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const liquidate = async () => {
    if (!opportunity?.unsignedXdr) {
      setWarning('This opportunity has no transaction prepared. Refresh the watchlist and try again.');
      return;
    }
    setLoading(true);
    try {
      const simulation = await simulateTransaction(opportunity.unsignedXdr);
      if (!simulation.ok || simulation.error?.includes('INSUFFICIENT_LIQUIDITY') || (simulation.healthFactor !== undefined && simulation.healthFactor >= 1)) {
        setWarning('Position already liquidated by someone else, or no longer eligible. Nothing was signed.');
        return;
      }
      const passphrase = (process.env.STELLAR_NETWORK_PASSPHRASE as string | undefined) ?? 'Test SDF Network ; September 2015';
      const signedXdr = await signTransaction(opportunity.unsignedXdr, passphrase);
      const sent = await sendTransaction(signedXdr);
      if (sent.status === 'ERROR') throw new Error(sent.error);
      Toast.show({ type: 'success', text1: 'Liquidation submitted', text2: 'Confirmation is pending on Stellar.' });
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Liquidation failed', error?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!opportunity) return <View style={styles.container}><Text style={styles.warning}>Opportunity unavailable.</Text></View>;
  return <View style={styles.container}>
    <Text style={styles.title}>Review liquidation</Text>
    <Text style={styles.asset}>{opportunity.borrowedAsset}</Text>
    <Text style={styles.detail}>Shortfall ${opportunity.shortfallUsd.toFixed(2)}</Text>
    <Text style={styles.detail}>Seizable collateral ${opportunity.collateralUsd.toFixed(2)}</Text>
    <Text style={styles.detail}>Expected profit ${opportunity.expectedProfitUsd.toFixed(2)}</Text>
    {warning ? <Text style={styles.warning}>{warning}</Text> : null}
    <TouchableOpacity style={styles.button} onPress={liquidate} disabled={loading}>
      {loading ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.buttonText}>Liquidate</Text>}
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24, paddingTop: 70, gap: 18 }, title: { color: '#fff', fontSize: 28, fontWeight: '700' }, asset: { color: '#f5c451', fontSize: 22, fontWeight: '700' }, detail: { color: '#bbb', fontSize: 16 }, warning: { color: '#f37f7f', lineHeight: 22 }, button: { marginTop: 18, padding: 17, borderRadius: 8, backgroundColor: '#f5c451', alignItems: 'center' }, buttonText: { color: '#0A0A0A', fontWeight: '800' } });
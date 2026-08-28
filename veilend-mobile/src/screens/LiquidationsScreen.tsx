import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type WatchlistItem = { id: string; borrowedAsset: string; borrowedUsd: number; collateralUsd: number; healthFactor: number; shortfallUsd: number; expectedProfitUsd: number };
type Watchlist = { myRisk: WatchlistItem[]; opportunities: WatchlistItem[]; pools: Array<{ asset: string; utilizationPercent: number }>; myLiquidationsPast: Array<{ id: string; status: string; amountUsd: number; asset: string }> };

export default function LiquidationsScreen({ navigation }: any) {
  const [tab, setTab] = useState<'risk' | 'opportunities' | 'past'>('opportunities');
  const [data, setData] = useState<Watchlist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Watchlist>('/liquidations/watchlist').then((response) => setData(response.data)).catch((reason) => setError(reason?.message ?? 'Could not load watchlist'));
  }, []);

  const items = tab === 'risk' ? data?.myRisk ?? [] : data?.opportunities ?? [];
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heading}><Ionicons name="shield-checkmark" size={28} color="#f5c451" /><Text style={styles.title}>Liquidations</Text></View>
      <View style={styles.tabs}>
        {([['risk', 'My Risk'], ['opportunities', 'All Opportunities'], ['past', 'My Liquidations Past']] as const).map(([key, label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.activeTab]}><Text style={[styles.tabText, tab === key && styles.activeText]}>{label}</Text></TouchableOpacity>)}
      </View>
      {!data && !error ? <ActivityIndicator color="#f5c451" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {tab === 'risk' && (data?.pools ?? []).map((pool) => <View key={pool.asset} style={styles.pool}><Text style={styles.asset}>{pool.asset} pool</Text><Text style={styles.warning}>{pool.utilizationPercent.toFixed(1)}% utilized</Text></View>)}
      {tab === 'past' ? (data?.myLiquidationsPast ?? []).map((item) => <View key={item.id} style={styles.card}><Text style={styles.asset}>{item.asset}</Text><Text style={styles.meta}>${item.amountUsd.toFixed(2)} · {item.status}</Text></View>) : items.map((item) => <TouchableOpacity key={item.id} style={styles.card} onPress={() => navigation.navigate('LiquidationReview', { opportunity: item })}><View><Text style={styles.asset}>{item.borrowedAsset}</Text><Text style={styles.meta}>HF {item.healthFactor.toFixed(2)} · shortfall ${item.shortfallUsd.toFixed(2)}</Text></View><Text style={styles.profit}>+${item.expectedProfitUsd.toFixed(2)}</Text></TouchableOpacity>)}
      {data && tab !== 'past' && items.length === 0 ? <Text style={styles.empty}>No positions in this view.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0A0A' }, content: { padding: 24, paddingTop: 60, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { color: '#fff', fontSize: 26, fontWeight: '700' }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#292929', marginVertical: 12 }, tab: { flex: 1, paddingVertical: 12 }, activeTab: { borderBottomWidth: 2, borderBottomColor: '#f5c451' }, tabText: { color: '#858585', textAlign: 'center', fontSize: 12 }, activeText: { color: '#f5c451' }, card: { backgroundColor: '#171717', padding: 16, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pool: { backgroundColor: '#241e10', padding: 14, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between' }, asset: { color: '#fff', fontSize: 16, fontWeight: '600' }, meta: { color: '#999', marginTop: 5 }, profit: { color: '#65d391', fontWeight: '700' }, warning: { color: '#f5c451' }, error: { color: '#f37f7f' }, empty: { color: '#777', textAlign: 'center', marginTop: 30 } });
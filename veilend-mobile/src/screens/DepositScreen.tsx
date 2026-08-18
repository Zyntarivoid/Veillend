import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, SupportedAsset } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';
import { ListSkeleton } from '../components/Skeletons';
import OfflineBanner from '../components/OfflineBanner';
import { getAssetIcon, getCurrencySymbol } from '../utils/helpers';

type SelectedAsset = { symbol: string; name: string; balance?: number } | null;

export default function DepositScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(null);
  const [amount, setAmount] = useState<string>('');

  const supportedAssets = useStore((s) => s.supportedAssets);
  const assetBalances = useStore((s) => s.assetBalances);
  const assetsLoading = useStore((s) => s.assetsLoading);
  const assetsError = useStore((s) => s.assetsError);
  const balance = useStore((s) => s.balance);
  const collateralValue = useStore((s) => s.collateralValue);
  const currency = useStore((s) => s.currency);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const fetchSupportedAssets = useStore((s) => s.fetchSupportedAssets);
  const fetchPortfolio = useStore((s) => s.fetchPortfolio);
  const deposit = useStore((s) => s.deposit);

  // Lazily hydrate assets + balances when this screen mounts. When the
  // dashboard already hydrated them, this is a no-op.
  useEffect(() => {
    if (!supportedAssets.length && !assetsLoading) {
      fetchSupportedAssets().catch(() => {});
    }
    if (!assetBalances.length) {
      fetchPortfolio().catch(() => {});
    }
  }, []);

  const balanceBySymbol = Object.fromEntries(
    assetBalances.map((b) => [b.asset, b.balance]),
  );

  const assets: Array<SupportedAsset & { balance: number; icon: string }> =
    supportedAssets.map((asset) => ({
      ...asset,
      balance: balanceBySymbol[asset.symbol] ?? 0,
      icon: getAssetIcon(asset.symbol),
    }));

  const openDepositModal = (asset: any) => {
    setSelectedAsset({ symbol: asset.symbol, name: asset.name, balance: asset.balance });
    setAmount(asset.balance > 0 ? String(asset.balance) : '');
    setModalVisible(true);
  };

  const confirmDeposit = async () => {
    if (!selectedAsset) return;
    try {
      const res = await deposit({ amount, asset: selectedAsset.symbol });
      Toast.show({ type: 'success', text1: 'Deposit Submitted', text2: `${amount} ${selectedAsset.symbol}` });
      setModalVisible(false);
    } catch (err: any) {
      // The store rolled back the optimistic update; surface the reason.
      Toast.show({ type: 'error', text1: 'Deposit Failed', text2: err?.message ?? 'Something went wrong' });
      setModalVisible(false);
    }
  };

  const renderAssetList = () => {
    if (assetsLoading && assets.length === 0) {
      return <ListSkeleton count={3} />;
    }
    if (!assetsLoading && assets.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>
            {assetsError ? 'Could not load supported assets' : 'No supported assets yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {assetsError
              ? 'Check your connection and try again.'
              : 'Once assets are configured on the protocol they will appear here.'}
          </Text>
          {assetsError ? (
            <TouchableOpacity style={styles.emptyCta} onPress={() => fetchSupportedAssets().catch(() => {})}>
              <Text style={styles.emptyCtaText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return (
      <View style={styles.assetsList}>
        {assets.map((asset) => (
          <TouchableOpacity
            key={asset.code ?? asset.symbol}
            style={styles.assetCard}
            onPress={() => openDepositModal(asset)}
          >
            <View style={styles.assetLeft}>
              <View style={styles.iconContainer}>
                {asset.logoUrl ? (
                  <Image source={{ uri: asset.logoUrl }} style={styles.assetLogo} />
                ) : (
                  <Ionicons name={asset.icon as any} size={24} color="#A855F7" />
                )}
              </View>
              <View>
                <Text style={styles.assetName}>{asset.name}</Text>
                <Text style={styles.assetSymbol}>{asset.symbol}</Text>
              </View>
            </View>

            <View style={styles.assetRight}>
              <Text style={styles.walletBalance}>
                {asset.balance} {asset.symbol}
              </Text>
              <Text style={styles.walletBalanceLabel}>Wallet balance</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <>
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Supply Market</Text>

      {/* Stats Header */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Wallet Balance</Text>
          <Text style={styles.statValue}>{getCurrencySymbol(currency)}{balance.toFixed(2)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Supplied</Text>
          <Text style={styles.statValue}>{getCurrencySymbol(currency)}{collateralValue.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Assets to Supply</Text>

      {renderAssetList()}

      <View style={{ height: 100 }} />
    </ScrollView>
      {/* Amount Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <OfflineBanner />
              <Text style={styles.modalTitle}>Deposit {selectedAsset?.symbol}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#888"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalBtn, { backgroundColor: '#333' }]}>
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmDeposit} style={[styles.modalBtn, { backgroundColor: '#A855F7' }]} disabled={lendingLoading}>
                    {lendingLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Confirm</Text>}
                  </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
          </Modal>
          </>
        );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 24,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#222',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  statLabel: {
    color: '#A1A1A1',
    marginBottom: 8,
    fontSize: 14,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  assetsList: {
    gap: 16,
  },
  assetCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  assetLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  assetName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  assetSymbol: {
    color: '#666',
    fontSize: 14,
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  walletBalance: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  walletBalanceLabel: {
    color: '#A1A1A1',
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 20,
    backgroundColor: '#A855F7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#121212',
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#222',
    gap: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  amountInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

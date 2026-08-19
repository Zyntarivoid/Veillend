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

export default function BorrowScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(null);
  const [amount, setAmount] = useState<string>('1');

  const supportedAssets = useStore((s) => s.supportedAssets);
  const assetBalances = useStore((s) => s.assetBalances);
  const assetsLoading = useStore((s) => s.assetsLoading);
  const assetsError = useStore((s) => s.assetsError);
  const borrowedValue = useStore((s) => s.borrowedValue);
  const availableToBorrow = useStore((s) => s.availableToBorrow);
  const currency = useStore((s) => s.currency);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const fetchSupportedAssets = useStore((s) => s.fetchSupportedAssets);
  const fetchPortfolio = useStore((s) => s.fetchPortfolio);
  const borrow = useStore((s) => s.borrow);

  // Lazily hydrate assets + balances on mount (no-op after dashboard hydrate).
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

  const getAssetAccessibilityLabel = (asset: SupportedAsset & { balance: number }) =>
    `${asset.name} (${asset.symbol}), APY unavailable, wallet balance ${asset.balance} ${asset.symbol}`;

  const openBorrowModal = (asset: any) => {
    setSelectedAsset({ symbol: asset.symbol, name: asset.name, balance: asset.balance });
    setAmount('1');
    setModalVisible(true);
  };

  const confirmBorrow = async () => {
    if (!selectedAsset) return;
    try {
      const res = await borrow({ amount, asset: selectedAsset.symbol });
      Toast.show({ type: 'success', text1: 'Borrow Submitted', text2: `${amount} ${selectedAsset.symbol}` });
      setModalVisible(false);
    } catch (err: any) {
      // The store rolled back the optimistic update; surface the reason.
      Toast.show({ type: 'error', text1: 'Borrow Failed', text2: err?.message ?? 'Something went wrong' });
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
            onPress={() => openBorrowModal(asset)}
            accessibilityRole="button"
            accessibilityLabel={getAssetAccessibilityLabel(asset)}
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
      <Text style={styles.headerTitle}>Borrow Market</Text>

      {/* Borrow Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Borrowed</Text>
          <Text style={styles.statValue}>{getCurrencySymbol(currency)}{borrowedValue.toFixed(2)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Borrow Limit</Text>
          <Text style={styles.statValue}>{getCurrencySymbol(currency)}{availableToBorrow.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Assets to Borrow</Text>

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
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: 'height' })} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <OfflineBanner />
              <Text style={styles.modalTitle}>Borrow {selectedAsset?.symbol}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#888"
                returnKeyType="done"
                onSubmitEditing={confirmBorrow}
              />
              <TouchableOpacity
                style={styles.maxButton}
                onPress={() => setAmount(String(availableToBorrow))}
                accessibilityRole="button"
                accessibilityLabel={`Use maximum ${selectedAsset?.symbol ?? 'asset'} amount`}
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalBtn, { backgroundColor: '#333' }]} accessibilityRole="button" accessibilityLabel="Cancel borrow">
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmBorrow} style={[styles.modalBtn, { backgroundColor: '#A855F7' }]} disabled={lendingLoading} accessibilityRole="button" accessibilityLabel="Confirm borrow">
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
  maxButton: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
  },
  maxButtonText: {
    color: '#A855F7',
    fontSize: 12,
    fontWeight: '700',
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

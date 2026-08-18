import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, SupportedAsset } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';
import { ListSkeleton } from '../components/Skeletons';
import OfflineBanner from '../components/OfflineBanner';
import { getAssetIcon, getCurrencySymbol } from '../utils/helpers';

type SelectedAsset = { symbol: string; name: string; balance?: number } | null;

const sanitizeAmountInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    cleaned = cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
  }
  return cleaned;
};

export default function BorrowScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(null);
  const [amount, setAmount] = useState<string>('');

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

  const openBorrowModal = (asset: any) => {
    setSelectedAsset({ symbol: asset.symbol, name: asset.name, balance: asset.balance });
    setAmount('');
    setModalVisible(true);
  };

  const handleAmountChange = (value: string) => {
    setAmount(sanitizeAmountInput(value));
  };

  const handleMaxPress = () => {
    if (availableToBorrow > 0) {
      setAmount(String(availableToBorrow));
    }
  };

  const { error, canSubmit } = useMemo(() => {
    const trimmed = amount.trim();
    if (trimmed === '') {
      return { error: null, canSubmit: false };
    }

    if (!/^\d*\.?\d+$/.test(trimmed) && !/^\d+\.?\d*$/.test(trimmed)) {
      return { error: 'Invalid amount', canSubmit: false };
    }

    const parsed = parseFloat(trimmed);
    if (!isFinite(parsed) || isNaN(parsed)) {
      return { error: 'Invalid amount', canSubmit: false };
    }

    if (parsed <= 0) {
      return { error: 'Amount must be greater than 0', canSubmit: false };
    }

    if (availableToBorrow != null && parsed > availableToBorrow) {
      return { error: 'Exceeds borrow limit', canSubmit: false };
    }

    return { error: null, canSubmit: true };
  }, [amount, availableToBorrow]);

  const confirmBorrow = async () => {
    if (!selectedAsset || !canSubmit || lendingLoading) return;
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

  const confirmDisabled = !canSubmit || lendingLoading;

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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <OfflineBanner />
              <Text style={styles.modalTitle}>Borrow {selectedAsset?.symbol}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={amount}
                  onChangeText={handleAmountChange}
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                  placeholder="Amount"
                  placeholderTextColor="#888"
                  accessibilityLabel="Borrow amount input"
                />
                <TouchableOpacity
                  onPress={handleMaxPress}
                  style={styles.maxButton}
                  accessibilityLabel="Borrow MAX button"
                >
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>
              {error != null && (
                <Text style={styles.errorText} accessibilityLabel={`Borrow error: ${error}`}>
                  {error}
                </Text>
              )}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.modalBtn, { backgroundColor: '#333' }]}
                  accessibilityLabel="Cancel borrow"
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmBorrow}
                  style={[styles.modalBtn, { backgroundColor: confirmDisabled ? '#555' : '#A855F7' }]}
                  disabled={confirmDisabled}
                  accessibilityLabel="Confirm borrow"
                >
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  maxButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderWidth: 1,
    borderColor: '#A855F7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  maxButtonText: {
    color: '#A855F7',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorText: {
    color: '#FF6363',
    fontSize: 14,
    fontWeight: '500',
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

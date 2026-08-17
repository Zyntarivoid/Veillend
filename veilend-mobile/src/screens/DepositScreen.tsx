import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_ASSETS } from '../data/mockData';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';

type SelectedAsset = { id: string; name: string; symbol: string; balance?: number } | null;

const sanitizeAmountInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    cleaned = cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
  }
  return cleaned;
};

export default function DepositScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(null);
  const [amount, setAmount] = useState<string>('');

  const lendingLoading = useStore((state) => state.lendingLoading);

  const openDepositModal = (asset: any) => {
    setSelectedAsset(asset);
    setAmount('');
    setModalVisible(true);
  };

  const handleAmountChange = (value: string) => {
    setAmount(sanitizeAmountInput(value));
  };

  const handleMaxPress = () => {
    if (selectedAsset?.balance != null) {
      setAmount(String(selectedAsset.balance));
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

    if (selectedAsset?.balance != null && parsed > selectedAsset.balance) {
      return { error: `Insufficient ${selectedAsset.symbol} balance`, canSubmit: false };
    }

    return { error: null, canSubmit: true };
  }, [amount, selectedAsset]);

  const confirmDeposit = async () => {
    if (!selectedAsset || !canSubmit || lendingLoading) return;
    try {
      const res = await useStore.getState().deposit({ amount, asset: selectedAsset.symbol });
      Toast.show({ type: 'success', text1: 'Deposit Submitted', text2: JSON.stringify(res) });
      setModalVisible(false);
    } catch (err: any) {
      const mockRes = { txHash: 'mock-' + Date.now(), status: 'mock', amount, asset: selectedAsset.symbol };
      useStore.setState({ lastLendingTx: mockRes });
      Toast.show({ type: 'info', text1: 'Offline - Mock Deposit', text2: JSON.stringify(mockRes) });
      setModalVisible(false);
    }
  };

  const confirmDisabled = !canSubmit || lendingLoading;

  return (
    <>
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Supply Market</Text>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Net APY</Text>
          <Text style={styles.statValue}>4.25%</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Supply Balance</Text>
          <Text style={styles.statValue}>$12,450</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Assets to Supply</Text>

      <View style={styles.assetsList}>
        {MOCK_ASSETS.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={styles.assetCard}
            onPress={() => openDepositModal(asset)}
          >
            <View style={styles.assetLeft}>
              <View style={styles.iconContainer}>
                 <Ionicons name={asset.icon as any} size={24} color="#A855F7" />
              </View>
              <View>
                <Text style={styles.assetName}>{asset.name}</Text>
                <Text style={styles.assetSymbol}>{asset.symbol}</Text>
              </View>
            </View>

            <View style={styles.assetRight}>
              <View style={styles.apyBadge}>
                <Text style={styles.apyText}>{asset.apy}% APY</Text>
              </View>
              <Text style={styles.walletBalance}>
                {asset.balance} {asset.symbol}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Deposit {selectedAsset?.symbol}</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#888"
                accessibilityLabel="Deposit amount input"
              />
              <TouchableOpacity
                onPress={handleMaxPress}
                style={styles.maxButton}
                accessibilityLabel="Deposit MAX button"
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
            </View>
            {error != null && (
              <Text style={styles.errorText} accessibilityLabel={`Deposit error: ${error}`}>
                {error}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: '#333' }]}
                accessibilityLabel="Cancel deposit"
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeposit}
                style={[styles.modalBtn, { backgroundColor: confirmDisabled ? '#555' : '#A855F7' }]}
                disabled={confirmDisabled}
                accessibilityLabel="Confirm deposit"
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
  apyBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  apyText: {
    color: '#A855F7',
    fontWeight: 'bold',
    fontSize: 12,
  },
  walletBalance: {
    color: '#A1A1A1',
    fontSize: 14,
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

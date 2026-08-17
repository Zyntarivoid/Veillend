import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_POSITIONS } from '../data/mockData';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';

const sanitizeAmountInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    cleaned = cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
  }
  return cleaned;
};

export default function RepayScreen() {
  const activeLoans = MOCK_POSITIONS.filter(p => p.type === 'Borrowed');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [amount, setAmount] = useState<string>('');

  const lendingLoading = useStore((state) => state.lendingLoading);

  const openRepayModal = (loan: any) => {
    setSelectedLoan(loan);
    setAmount('');
    setModalVisible(true);
  };

  const handleAmountChange = (value: string) => {
    setAmount(sanitizeAmountInput(value));
  };

  const handleMaxPress = () => {
    if (selectedLoan?.amount != null) {
      setAmount(String(selectedLoan.amount));
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

    if (selectedLoan?.amount != null && parsed > selectedLoan.amount) {
      return { error: 'Cannot repay more than owed', canSubmit: false };
    }

    return { error: null, canSubmit: true };
  }, [amount, selectedLoan]);

  const confirmRepay = async () => {
    if (!selectedLoan || !canSubmit || lendingLoading) return;
    try {
      const res = await useStore.getState().repay({ amount, asset: selectedLoan.asset });
      Toast.show({ type: 'success', text1: 'Repay Submitted', text2: JSON.stringify(res) });
      setModalVisible(false);
    } catch (err: any) {
      const mockRes = { txHash: 'mock-' + Date.now(), status: 'mock', amount, asset: selectedLoan.asset };
      useStore.setState({ lastLendingTx: mockRes });
      Toast.show({ type: 'info', text1: 'Offline - Mock Repay', text2: JSON.stringify(mockRes) });
      setModalVisible(false);
    }
  };

  const confirmDisabled = !canSubmit || lendingLoading;

  return (
    <>
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Repay Loans</Text>

      {activeLoans.length > 0 ? (
        <View style={styles.loansList}>
          {activeLoans.map((loan) => (
            <View key={loan.id} style={styles.loanCard}>
              <View style={styles.cardHeader}>
                <View style={styles.assetInfo}>
                   <View style={styles.iconContainer}>
                      <Ionicons name="cash-outline" size={24} color="#A855F7" />
                   </View>
                   <View>
                     <Text style={styles.assetName}>{loan.asset}</Text>
                     <Text style={styles.loanLabel}>Debt</Text>
                   </View>
                </View>
                <View style={styles.healthBadge}>
                  <Text style={styles.healthText}>Health: {loan.healthFactor}</Text>
                </View>
              </View>

              <View style={styles.loanDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Amount Owed</Text>
                  <Text style={styles.detailValue}>{loan.amount} {loan.asset}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Value</Text>
                  <Text style={styles.detailValue}>${loan.value.toLocaleString()}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Interest Accrued</Text>
                  <Text style={styles.detailValue}>$12.50</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.repayButton}
                onPress={() => {
                  const token = useStore.getState().authToken;
                  if (!token) {
                    Toast.show({ type: 'error', text1: 'Not Authenticated', text2: 'Please connect your wallet first' });
                    return;
                  }
                  openRepayModal(loan);
                }}
                accessibilityLabel={`Repay ${loan.asset} loan`}
              >
                <Text style={styles.buttonText}>Repay Now</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>No active loans</Text>
          <Text style={styles.emptySubtext}>You don't have any borrowed assets to repay.</Text>
        </View>
      )}
    </ScrollView>
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Repay {selectedLoan?.asset}</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#888"
                accessibilityLabel="Repay amount input"
              />
              <TouchableOpacity
                onPress={handleMaxPress}
                style={styles.maxButton}
                accessibilityLabel="Repay MAX button"
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
            </View>
            {error != null && (
              <Text style={styles.errorText} accessibilityLabel={`Repay error: ${error}`}>
                {error}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: '#333' }]}
                accessibilityLabel="Cancel repay"
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmRepay}
                style={[styles.modalBtn, { backgroundColor: confirmDisabled ? '#555' : '#A855F7' }]}
                disabled={confirmDisabled}
                accessibilityLabel="Confirm repay"
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
  loansList: {
    gap: 16,
  },
  loanCard: {
    backgroundColor: '#121212',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  assetName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loanLabel: {
    color: '#666',
    fontSize: 12,
  },
  healthBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  healthText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loanDetails: {
    gap: 12,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: '#A1A1A1',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  repayButton: {
    backgroundColor: '#A855F7',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
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
});

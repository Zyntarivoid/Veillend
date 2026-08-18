import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';
import { ListSkeleton } from '../components/Skeletons';
import OfflineBanner from '../components/OfflineBanner';

type ActiveLoan = {
  id: string;
  asset: string;
  amount: number;
  status: string;
  healthFactor: number;
};

export default function RepayScreen({ navigation }: any) {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<ActiveLoan | null>(null);
  const [amount, setAmount] = useState<string>('');

  const positions = useStore((s) => s.positions);
  const positionsLoading = useStore((s) => s.positionsLoading);
  const positionsError = useStore((s) => s.positionsError);
  const supportedAssets = useStore((s) => s.supportedAssets);
  const healthFactor = useStore((s) => s.healthFactor);
  const lendingLoading = useStore((s) => s.lendingLoading);
  const fetchPositions = useStore((s) => s.fetchPositions);
  const fetchSupportedAssets = useStore((s) => s.fetchSupportedAssets);
  const repay = useStore((s) => s.repay);

  // Lazily hydrate positions + asset metadata on mount.
  useEffect(() => {
    if (!positions.length && !positionsLoading) {
      fetchPositions().catch(() => {});
    }
    if (!supportedAssets.length) {
      fetchSupportedAssets().catch(() => {});
    }
  }, []);

  const symbolByContract = useMemo(
    () =>
      Object.fromEntries(
        supportedAssets
          .filter((a) => a.contractId)
          .map((a) => [a.contractId as string, a.symbol]),
      ),
    [supportedAssets],
  );

  // Borrowed positions → active loans (live protocol data).
  const activeLoans: ActiveLoan[] = useMemo(
    () =>
      positions
        .filter((p) => p.borrowed > 0)
        .map((p) => ({
          id: p.assetAddress || p.userAddress,
          asset: symbolByContract[p.assetAddress] ?? `…${p.assetAddress.slice(-4)}`,
          amount: p.borrowed,
          status: 'Active',
          healthFactor,
        })),
    [positions, symbolByContract, healthFactor],
  );

  const openRepayModal = (loan: ActiveLoan) => {
    setSelectedLoan(loan);
    setAmount(String(loan.amount));
    setModalVisible(true);
  };

  const confirmRepay = async () => {
    if (!selectedLoan) return;
    try {
      const res = await repay({ amount, asset: selectedLoan.asset });
      Toast.show({ type: 'success', text1: 'Repay Submitted', text2: `${amount} ${selectedLoan.asset}` });
      setModalVisible(false);
    } catch (err: any) {
      // The store rolled back the optimistic update; surface the reason.
      Toast.show({ type: 'error', text1: 'Repay Failed', text2: err?.message ?? 'Something went wrong' });
      setModalVisible(false);
    }
  };

  const renderLoans = () => {
    if (positionsLoading && activeLoans.length === 0) {
      return <ListSkeleton count={2} height={180} />;
    }
    if (!positionsLoading && activeLoans.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>
            {positionsError ? 'Could not load positions' : 'No active loans'}
          </Text>
          <Text style={styles.emptySubtext}>
            {positionsError
              ? 'Check your connection and try again.'
              : "You don't have any borrowed assets to repay."}
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation?.navigate('Borrow')}
          >
            <Text style={styles.emptyCtaText}>Borrow Assets</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.loansList}>
        {activeLoans.map((loan) => (
          <View key={loan.id} style={styles.loanCard} accessible accessibilityLabel={`Loan for ${loan.amount} ${loan.asset}, status ${loan.status}, health factor ${loan.healthFactor}`}>
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
                <Text style={styles.detailValue}>{loan.amount.toLocaleString()} {loan.asset}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>{loan.status}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.repayButton}
              accessibilityRole="button"
              accessibilityLabel={`Repay ${loan.asset} loan`}
              onPress={() => {
                const token = useStore.getState().authToken;
                if (!token) {
                  Toast.show({ type: 'error', text1: 'Not Authenticated', text2: 'Please connect your wallet first' });
                  return;
                }
                openRepayModal(loan);
              }}
            >
              <Text style={styles.buttonText}>Repay Now</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <>
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Repay Loans</Text>

      {renderLoans()}
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
              <Text style={styles.modalTitle}>Repay {selectedLoan?.asset}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={styles.amountInput}
                placeholder="Amount"
                placeholderTextColor="#888"
                returnKeyType="done"
                onSubmitEditing={confirmRepay}
              />
              <TouchableOpacity
                style={styles.maxButton}
                onPress={() => setAmount(String(selectedLoan?.amount ?? 0))}
                accessibilityRole="button"
                accessibilityLabel={`Use maximum ${selectedLoan?.asset ?? 'asset'} amount`}
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalBtn, { backgroundColor: '#333' }]} accessibilityRole="button" accessibilityLabel="Cancel repay">
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmRepay} style={[styles.modalBtn, { backgroundColor: '#A855F7' }]} disabled={lendingLoading} accessibilityRole="button" accessibilityLabel="Confirm repay">
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
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 20,
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
});

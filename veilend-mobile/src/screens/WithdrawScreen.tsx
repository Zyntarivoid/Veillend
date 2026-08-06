import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_POSITIONS } from '../data/mockData';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';

export default function WithdrawScreen() {
  const deposits = MOCK_POSITIONS.filter(p => p.type === 'Collateral');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [amount, setAmount] = useState<string>('');

  const openWithdrawModal = (deposit: any) => {
    setSelectedDeposit(deposit);
    setAmount(String(deposit.amount));
    setModalVisible(true);
  };

  const confirmWithdraw = async () => {
    if (!selectedDeposit) return;
    try {
      const res = await useStore.getState().withdraw({ amount, asset: selectedDeposit.asset });
      Toast.show({ type: 'success', text1: 'Withdraw Submitted', text2: JSON.stringify(res) });
      setModalVisible(false);
    } catch (err: any) {
      const mockRes = { txHash: 'mock-' + Date.now(), status: 'mock', amount, asset: selectedDeposit.asset };
      useStore.setState({ lastLendingTx: mockRes });
      Toast.show({ type: 'info', text1: 'Offline - Mock Withdraw', text2: JSON.stringify(mockRes) });
      setModalVisible(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <Text style={styles.headerTitle}>Withdraw</Text>

        {/* Withdraw Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Deposited</Text>
            <Text style={styles.statValue}>
              ${deposits.reduce((sum, d) => sum + d.value, 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Assets</Text>
            <Text style={styles.statValue}>{deposits.length}</Text>
          </View>
        </View>

        {deposits.length > 0 ? (
          <View style={styles.depositsList}>
            <Text style={styles.sectionTitle}>Your Deposits</Text>
            {deposits.map((deposit) => (
              <View key={deposit.id} style={styles.depositCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.assetInfo}>
                    <View style={styles.iconContainer}>
                      <Ionicons name="shield-checkmark-outline" size={24} color="#A855F7" />
                    </View>
                    <View>
                      <Text style={styles.assetName}>{deposit.asset}</Text>
                      <Text style={styles.depositLabel}>Collateral</Text>
                    </View>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{deposit.status}</Text>
                  </View>
                </View>

                <View style={styles.depositDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount Deposited</Text>
                    <Text style={styles.detailValue}>{deposit.amount} {deposit.asset}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Value</Text>
                    <Text style={styles.detailValue}>${deposit.value.toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Health Factor</Text>
                    <Text style={styles.detailValue}>{deposit.healthFactor}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.withdrawButton}
                  onPress={() => {
                    const token = useStore.getState().authToken;
                    if (!token) {
                      Toast.show({ type: 'error', text1: 'Not Authenticated', text2: 'Please connect your wallet first' });
                      return;
                    }
                    openWithdrawModal(deposit);
                  }}
                >
                  <Text style={styles.buttonText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>No deposits to withdraw</Text>
            <Text style={styles.emptySubtext}>You haven't deposited any assets yet. Add collateral to get started.</Text>
          </View>
        )}

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
            <Text style={styles.modalTitle}>Withdraw {selectedDeposit?.asset}</Text>
            <Text style={styles.modalSubtext}>
              Amount: {selectedDeposit?.amount} {selectedDeposit?.asset} available
            </Text>
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
              <TouchableOpacity
                onPress={confirmWithdraw}
                style={[styles.modalBtn, { backgroundColor: '#A855F7' }]}
                disabled={useStore.getState().lendingLoading}
              >
                {useStore.getState().lendingLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirm</Text>}
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
  depositsList: {
    gap: 16,
  },
  depositCard: {
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
  depositLabel: {
    color: '#666',
    fontSize: 12,
  },
  statusBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  statusText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: 'bold',
  },
  depositDetails: {
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
  withdrawButton: {
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
  modalSubtext: {
    color: '#A1A1A1',
    fontSize: 14,
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
});
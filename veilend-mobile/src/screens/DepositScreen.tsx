import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_ASSETS } from '../data/mockData';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';

type SelectedAsset = { id: string; name: string; symbol: string; balance?: number } | null;

export default function DepositScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(null);
  const [amount, setAmount] = useState<string>('');

  const openDepositModal = (asset: any) => {
    setSelectedAsset(asset);
    setAmount(String(asset.balance ?? '1'));
    setModalVisible(true);
  };

  const confirmDeposit = async () => {
    if (!selectedAsset) return;
      try {
      const res = await useStore.getState().deposit({ amount, asset: selectedAsset.symbol });
      Toast.show({ type: 'success', text1: 'Deposit Submitted', text2: JSON.stringify(res) });
      setModalVisible(false);
    } catch (err: any) {
      // Fallback to mock response when offline / API fails
      const mockRes = { txHash: 'mock-' + Date.now(), status: 'mock', amount, asset: selectedAsset.symbol };
      useStore.setState({ lastLendingTx: mockRes });
      Toast.show({ type: 'info', text1: 'Offline - Mock Deposit', text2: JSON.stringify(mockRes) });
      setModalVisible(false);
    }
  };
  return (
    <>
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Supply Market</Text>
      
      {/* Stats Header */}
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
      {/* Amount Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
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
                  <TouchableOpacity onPress={confirmDeposit} style={[styles.modalBtn, { backgroundColor: '#A855F7' }]} disabled={useStore.getState().lendingLoading}>
                    {useStore.getState().lendingLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Confirm</Text>}
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
});

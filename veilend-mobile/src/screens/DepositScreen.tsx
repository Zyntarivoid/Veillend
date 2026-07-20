import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_ASSETS } from '../data/mockData';
import { useStore } from '../store/store';
import { ActivityIndicator } from 'react-native';
import Toast from '../utils/toast';
import { useResponsive } from '../hooks/useResponsive';

type SelectedAsset = { id: string; name: string; symbol: string; balance?: number } | null;

export default function DepositScreen() {
  const { isSmallScreen } = useResponsive();
  const styles = makeStyles(isSmallScreen);

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
      <View
        style={styles.statsContainer}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel="Supply market stats: Net APY 4.25%, Supply Balance $12,450"
      >
        <View style={styles.statBox} importantForAccessibility="no">
          <Text style={styles.statLabel}>Net APY</Text>
          <Text style={styles.statValue}>4.25%</Text>
        </View>
        <View style={styles.statDivider} importantForAccessibility="no" />
        <View style={styles.statBox} importantForAccessibility="no">
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
            accessibilityRole="button"
            accessibilityLabel={`Deposit ${asset.name} (${asset.symbol}), ${asset.apy}% APY, wallet balance: ${asset.balance} ${asset.symbol}`}
            accessibilityHint="Double tap to open deposit amount dialog"
          >
            <View style={styles.assetLeft}>
              <View style={styles.iconContainer}>
                 <Ionicons name={asset.icon as any} size={24} color="#A855F7" importantForAccessibility="no" />
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
        accessibilityViewIsModal={true}
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
              accessibilityLabel={`Deposit amount in ${selectedAsset?.symbol ?? 'asset'}`}
              accessibilityHint="Enter the amount you want to deposit"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: '#333' }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel deposit"
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeposit}
                style={[styles.modalBtn, { backgroundColor: '#A855F7' }]}
                disabled={useStore.getState().lendingLoading}
                accessibilityRole="button"
                accessibilityLabel={`Confirm deposit of ${amount} ${selectedAsset?.symbol ?? ''}`}
                accessibilityState={{ disabled: useStore.getState().lendingLoading }}
              >
                {useStore.getState().lendingLoading
                  ? <ActivityIndicator color="#fff"/>
                  : <Text style={styles.buttonText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function makeStyles(isSmallScreen: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0A0A0A',
      padding: isSmallScreen ? 16 : 24,
      paddingTop: 60,
    },
    headerTitle: {
      fontSize: isSmallScreen ? 22 : 28,
      fontWeight: 'bold',
      color: '#FFFFFF',
      marginBottom: 24,
    },
    statsContainer: {
      flexDirection: 'row',
      backgroundColor: '#121212',
      borderRadius: 16,
      padding: isSmallScreen ? 14 : 20,
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
      fontSize: isSmallScreen ? 12 : 14,
    },
    statValue: {
      color: '#FFFFFF',
      fontSize: isSmallScreen ? 18 : 24,
      fontWeight: 'bold',
    },
    sectionTitle: {
      color: '#FFFFFF',
      fontSize: isSmallScreen ? 16 : 18,
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
      padding: isSmallScreen ? 12 : 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#222',
      minHeight: 72,
    },
    assetLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isSmallScreen ? 10 : 16,
      flexShrink: 1,
    },
    iconContainer: {
      width: isSmallScreen ? 40 : 48,
      height: isSmallScreen ? 40 : 48,
      backgroundColor: '#1A1A1A',
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#333',
    },
    assetName: {
      color: '#FFFFFF',
      fontSize: isSmallScreen ? 14 : 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    assetSymbol: {
      color: '#666',
      fontSize: isSmallScreen ? 12 : 14,
    },
    assetRight: {
      alignItems: 'flex-end',
      flexShrink: 0,
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
      fontSize: isSmallScreen ? 12 : 14,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: '#121212',
      padding: isSmallScreen ? 16 : 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: '#222',
      gap: 16,
    },
    modalTitle: {
      color: '#FFFFFF',
      fontSize: isSmallScreen ? 18 : 22,
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
      paddingVertical: isSmallScreen ? 14 : 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    buttonText: {
      color: '#FFFFFF',
      fontWeight: 'bold',
      fontSize: isSmallScreen ? 14 : 16,
    },
  });
}

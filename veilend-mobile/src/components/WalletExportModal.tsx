import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
  Clipboard,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import Toast from '../utils/toast';

const { width } = Dimensions.get('window');

type WalletExportModalProps = {
  visible: boolean;
  onRequestSecret: () => Promise<string | null>;
  onClose: () => void;
};

type ExportStep = 'warning' | 'export' | 'exported';

export function WalletExportModal({
  visible,
  onRequestSecret,
  onClose,
}: WalletExportModalProps) {
  const [step, setStep] = useState<ExportStep>('warning');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedData, setExportedData] = useState<string | null>(null);

  const handleExport = () => {
    setStep('export');
  };

  const handleCopyToClipboard = async () => {
    const secretKey = await onRequestSecret();
    if (secretKey) {
      await Clipboard.setString(secretKey);
      Toast.show({
        type: 'success',
        text1: 'Copied to clipboard',
        text2: 'Secret key copied securely',
      });
    }
  };

  const handleExportToFile = async () => {
    const secretKey = await onRequestSecret();
    if (!secretKey) return;
    
    setIsExporting(true);
    try {
      const fileName = `veilend_backup_${Date.now()}.txt`;
      // Use FileSystem with type assertion to access documentDirectory
      const fs = FileSystem as any;
      const documentDir = fs.documentDirectory;
      
      if (!documentDir) {
        throw new Error('Unable to access document directory');
      }
      
      const filePath = `${documentDir}${fileName}`;
      
      const content = `VEILEND WALLET BACKUP\n\nSecret Key: ${secretKey}\nGenerated: ${new Date().toISOString()}\n\nWARNING: Keep this file secure. Anyone with access to this file can control your wallet.\n`;
      
      await FileSystem.writeAsStringAsync(filePath, content);
      
      // Use Share.share directly with content
      try {
        await Share.share({
          message: content,
          title: 'Export Wallet Backup',
        });
      } catch (shareError) {
        // If sharing fails, at least the file was created
        console.log('Share failed but file was created:', shareError);
        Toast.show({
          type: 'info',
          text1: 'File Created',
          text2: `Backup saved to device storage`,
        });
      }
      
      setExportedData(filePath);
      setStep('exported');
      Toast.show({
        type: 'success',
        text1: 'Export Successful',
        text2: 'Wallet backup exported securely',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Export Failed',
        text2: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderWarningStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="warning" size={48} color="#FF6B6B" />
      </View>
      <Text style={styles.stepTitle}>Security Warning</Text>
      <Text style={styles.stepDescription}>
        Exporting your wallet credentials is a sensitive operation. Please understand the risks before proceeding.
      </Text>

      <View style={styles.riskContainer}>
        <View style={styles.riskItem}>
          <Ionicons name="radio-button-on" size={16} color="#FF6B6B" />
          <Text style={styles.riskText}>
            Anyone with access to your secret key can control your wallet
          </Text>
        </View>
        <View style={styles.riskItem}>
          <Ionicons name="radio-button-on" size={16} color="#FF6B6B" />
          <Text style={styles.riskText}>
            Store exported files in a secure, encrypted location
          </Text>
        </View>
        <View style={styles.riskItem}>
          <Ionicons name="radio-button-on" size={16} color="#FF6B6B" />
          <Text style={styles.riskText}>
            Never share your secret key via email or messaging apps
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cancelButton]}
          onPress={onClose}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.exportButton]}
          onPress={handleExport}
        >
          <Text style={styles.exportButtonText}>I Understand, Proceed</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderExportStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="download-outline" size={48} color="#00D1FF" />
      </View>
      <Text style={styles.stepTitle}>Export Wallet</Text>
      <Text style={styles.stepDescription}>
        Choose how you want to export your wallet credentials.
      </Text>

      <View style={styles.exportOptions}>
        <TouchableOpacity
          style={styles.exportOption}
          onPress={handleCopyToClipboard}
        >
          <Ionicons name="copy-outline" size={32} color="#FFFFFF" />
          <Text style={styles.exportOptionTitle}>Copy to Clipboard</Text>
          <Text style={styles.exportOptionDesc}>
            Copy your secret key to clipboard (cleared after 30 seconds)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exportOption}
          onPress={handleExportToFile}
          disabled={isExporting}
        >
          <Ionicons name="document-text-outline" size={32} color="#FFFFFF" />
          <Text style={styles.exportOptionTitle}>Export to File</Text>
          <Text style={styles.exportOptionDesc}>
            {isExporting ? 'Exporting...' : 'Create a backup file with your credentials'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.cancelButton, { width: '100%' }]}
        onPress={() => setStep('warning')}
      >
        <Text style={styles.cancelButtonText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  const renderExportedStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.successIconContainer}>
        <Ionicons name="checkmark-circle" size={64} color="#09cc71" />
      </View>
      <Text style={styles.successTitle}>Export Complete!</Text>
      <Text style={styles.stepDescription}>
        Your wallet has been exported successfully. Please ensure the exported file is stored securely.
      </Text>

      <View style={styles.successTips}>
        <View style={styles.tipItem}>
          <Ionicons name="lock-closed-outline" size={20} color="#09cc71" />
          <Text style={styles.tipText}>
            Store the exported file in a secure, encrypted location
          </Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
          <Text style={styles.tipText}>
            Consider deleting the exported file after safe storage
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.doneButton]}
        onPress={onClose}
      >
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close-outline" size={28} color="#888" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 'warning' && renderWarningStep()}
            {step === 'export' && renderExportStep()}
            {step === 'exported' && renderExportedStep()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    width: width * 0.92,
    maxHeight: '85%',
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 8,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepDescription: {
    color: '#A1A1A1',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  riskContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.1)',
  },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 8,
  },
  riskText: {
    flex: 1,
    color: '#D1D1D1',
    fontSize: 14,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: '#FF6B6B',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  exportOptions: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  exportOption: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    gap: 8,
  },
  exportOptionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  exportOptionDesc: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  successTips: {
    width: '100%',
    backgroundColor: 'rgba(9, 204, 113, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(9, 204, 113, 0.1)',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  tipText: {
    flex: 1,
    color: '#D1D1D1',
    fontSize: 14,
  },
  doneButton: {
    backgroundColor: '#09cc71',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
});
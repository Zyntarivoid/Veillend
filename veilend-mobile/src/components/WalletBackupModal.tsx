import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextInput,
  Platform,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from '../utils/toast';

const { width } = Dimensions.get('window');

type WalletBackupModalProps = {
  visible: boolean;
  onRequestSecret: () => Promise<string | null>;
  onClose: () => void;
  onBackupConfirmed: () => void;
};

type BackupStep = 'reveal' | 'confirm' | 'success';

export function WalletBackupModal({
  visible,
  onRequestSecret,
  onClose,
  onBackupConfirmed,
}: WalletBackupModalProps) {
  const [step, setStep] = useState<BackupStep>('reveal');
  const [confirmInput, setConfirmInput] = useState('');
  const [isSecretRevealed, setIsSecretRevealed] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SECURE_TIMER_DURATION = 30000;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const secret = await onRequestSecret();
        if (!mounted || !secret) return;
        const firstFour = secret.slice(0, 4);
        const lastFour = secret.slice(-4);
        const dotCount = Math.min(secret.length - 8, 20);
        setMaskedKey(`${firstFour}${'•'.repeat(dotCount > 0 ? dotCount : 0)}${lastFour}`);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
      setMaskedKey('');
    };
  }, [onRequestSecret]);

  const handleReveal = async () => {
    try {
      const secret = await onRequestSecret();
      if (!secret) return;
      setRevealedSecret(secret);
      setIsSecretRevealed(true);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => {
        setIsSecretRevealed(false);
        setRevealedSecret(null);
        if (revealTimerRef.current) {
          clearTimeout(revealTimerRef.current);
          revealTimerRef.current = null;
        }
      }, SECURE_TIMER_DURATION);
    } catch (e) {}
  };

  const handleCopyToClipboard = async () => {
    const secret = revealedSecret ?? (await onRequestSecret());
    if (secret) {
      await Clipboard.setString(secret);
      Toast.show({
        type: 'success',
        text1: 'Copied to clipboard',
        text2: 'Secret key copied securely',
      });
    }
  };

  const handleConfirm = async () => {
    const secret = revealedSecret ?? (await onRequestSecret());
    if (secret && confirmInput.trim() === secret) {
      setStep('success');
      onBackupConfirmed();
      Toast.show({
        type: 'success',
        text1: 'Backup Confirmed',
        text2: 'Your wallet has been securely backed up',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Invalid Key',
        text2: 'The secret key you entered does not match',
      });
    }
  };

  const handleClose = () => {
    setStep('reveal');
    setIsSecretRevealed(false);
    setConfirmInput('');
    onClose();
  };

  const renderRevealStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="shield-outline" size={48} color="#09cc71" />
      </View>
      <Text style={styles.stepTitle}>Backup Your Wallet</Text>
      <Text style={styles.stepDescription}>
        Your secret key is the only way to recover your wallet. Please backup this key securely.
      </Text>

      <View style={styles.secretKeyContainer}>
        <Text style={styles.secretKeyLabel}>Your Secret Key</Text>
        <View style={styles.secretKeyBox}>
          <Text style={styles.secretKeyText}>
            {isSecretRevealed ? (revealedSecret ?? '') : maskedKey}
          </Text>
          <TouchableOpacity
          style={styles.eyeButton}
          onPress={handleReveal}
          accessibilityRole="button"
          accessibilityLabel={isSecretRevealed ? 'Hide secret key' : 'Reveal secret key'}
          >
            <Ionicons
              name={isSecretRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={24}
              color="#09cc71"
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.warningContainer}>
        <Ionicons name="warning-outline" size={20} color="#FFD700" />
        <Text style={styles.warningText}>
          Never share your secret key with anyone. Store it in a secure location.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.copyButton]}
          onPress={handleCopyToClipboard}
          disabled={!isSecretRevealed}
          accessibilityRole="button"
          accessibilityLabel="Copy secret key"
        >
          <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
          <Text style={styles.copyButtonText}>Copy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.nextButton]}
          onPress={() => setStep('confirm')}
          disabled={!isSecretRevealed}
          accessibilityRole="button"
          accessibilityLabel="Continue to confirm wallet backup"
        >
          <Text style={styles.nextButtonText}>I've Saved It →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfirmStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-circle-outline" size={48} color="#09cc71" />
      </View>
      <Text style={styles.stepTitle}>Confirm Backup</Text>
      <Text style={styles.stepDescription}>
        To confirm you've backed up your secret key, please enter it below.
      </Text>

      <View style={styles.confirmInputContainer}>
        <Text style={styles.confirmInputLabel}>Enter your secret key</Text>
        <TextInput
          style={styles.confirmInput}
          placeholder="S…"
          placeholderTextColor="#555"
          value={confirmInput}
          onChangeText={setConfirmInput}
          autoCapitalize="characters"
          autoCorrect={false}
          secureTextEntry={true}
          returnKeyType="done"
          onSubmitEditing={handleConfirm}
        />
      </View>

      <View style={styles.warningContainer}>
        <Ionicons name="information-circle-outline" size={20} color="#00D1FF" />
        <Text style={styles.infoText}>
          This confirms you have safely stored your secret key.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.backButton]}
          onPress={() => {
            setStep('reveal');
            setIsSecretRevealed(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back to reveal wallet backup"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.confirmButton,
            !confirmInput.trim() && styles.disabledButton,
          ]}
          onPress={handleConfirm}
          disabled={!confirmInput.trim()}
          accessibilityRole="button"
          accessibilityLabel="Confirm wallet backup"
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.successIconContainer}>
        <Ionicons name="checkmark-circle" size={64} color="#09cc71" />
      </View>
      <Text style={styles.successTitle}>Backup Complete! 🎉</Text>
      <Text style={styles.successDescription}>
        Your wallet has been securely backed up. Remember to keep your secret key in a safe place.
      </Text>

      <View style={styles.successTips}>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-outline" size={20} color="#09cc71" />
          <Text style={styles.tipText}>Store your key offline</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-outline" size={20} color="#09cc71" />
          <Text style={styles.tipText}>Never share it with anyone</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-outline" size={20} color="#09cc71" />
          <Text style={styles.tipText}>Consider multiple backup locations</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.doneButton]}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Continue to app"
      >
        <Text style={styles.doneButtonText}>Continue to App</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close modal" onPress={handleClose}>
            <Ionicons name="close-outline" size={28} color="#888" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === 'reveal' && renderRevealStep()}
            {step === 'confirm' && renderConfirmStep()}
            {step === 'success' && renderSuccessStep()}
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
    backgroundColor: 'rgba(9, 204, 113, 0.1)',
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
  secretKeyContainer: {
    width: '100%',
    marginBottom: 16,
  },
  secretKeyLabel: {
    color: '#A1A1A1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  secretKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secretKeyText: {
    flex: 1,
    color: '#09cc71',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
  },
  eyeButton: {
    padding: 4,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    width: '100%',
  },
  warningText: {
    flex: 1,
    color: '#FFD700',
    fontSize: 13,
    marginLeft: 8,
    lineHeight: 18,
  },
  infoText: {
    flex: 1,
    color: '#00D1FF',
    fontSize: 13,
    marginLeft: 8,
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
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#09cc71',
  },
  nextButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#09cc71',
  },
  confirmButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  confirmInputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  confirmInputLabel: {
    color: '#A1A1A1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmInput: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  successDescription: {
    color: '#A1A1A1',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
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
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from '../utils/toast';
import { useWalletSecurity, SECURE_TIMER_DURATION } from '../hooks/useWalletSecurity';

const { width } = Dimensions.get('window');

// Single source of truth lives in the hook; use it here so both stay in sync.
const TIMER_DURATION_MS = SECURE_TIMER_DURATION;
const WARNING_BEFORE_MS = 5_000; // show warning this many ms before auto-hide

type WalletBackupModalProps = {
  visible: boolean;
  onRequestSecret: () => Promise<string | null>;
  onClose: () => void;
  onBackupConfirmed: () => void;
  /**
   * When `true` the modal is shown as part of the initial onboarding flow:
   *  - The X close button and Android hardware-back do nothing on `reveal`
   *    and `confirm` steps.
   *  - The modal becomes freely closable on the `success` step.
   * When `false` (default) the modal is freely closable at any time, matching
   * the re-entry behaviour from the Settings screen.
   */
  isOnboardingFlow?: boolean;
};

type BackupStep = 'reveal' | 'confirm' | 'success';

export function WalletBackupModal({
  visible,
  onRequestSecret,
  onClose,
  onBackupConfirmed,
  isOnboardingFlow = false,
}: WalletBackupModalProps) {
  const [step, setStep] = useState<BackupStep>('reveal');
  const [confirmInput, setConfirmInput] = useState('');
  const [isSecretRevealed, setIsSecretRevealed] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Countdown display value (seconds remaining, null when timer is not active)
  const [countdownSecs, setCountdownSecs] = useState<number | null>(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealStartRef = useRef<number | null>(null);

  const { copyToClipboard, confirmBackup } = useWalletSecurity();

  // ─── helpers ──────────────────────────────────────────────────────────────

  const clearAllTimers = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    revealStartRef.current = null;
  }, []);

  const maskSecret = useCallback(() => {
    setIsSecretRevealed(false);
    setRevealedSecret(null);
    setCountdownSecs(null);
    clearAllTimers();
  }, [clearAllTimers]);

  // ─── load masked key preview ───────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    (async () => {
      try {
        const secret = await onRequestSecret();
        if (!mounted || !secret) return;
        const firstFour = secret.slice(0, 4);
        const lastFour = secret.slice(-4);
        const dotCount = Math.min(secret.length - 8, 20);
        setMaskedKey(
          `${firstFour}${'•'.repeat(dotCount > 0 ? dotCount : 0)}${lastFour}`,
        );
      } catch {
        // ignore – user will tap reveal to try again
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onRequestSecret, visible]);

  // ─── clear timers on unmount or when modal closes ──────────────────────────

  useEffect(() => {
    if (!visible) {
      maskSecret();
      setMaskedKey('');
    }
    return clearAllTimers;
  }, [visible, maskSecret, clearAllTimers]);

  // ─── reveal with 30 s auto-hide + 5 s warning ─────────────────────────────

  const startRevealTimer = useCallback(
    (secret: string) => {
      clearAllTimers();

      const startedAt = Date.now();
      revealStartRef.current = startedAt;

      // Tick every second to keep countdownSecs in sync
      tickIntervalRef.current = setInterval(() => {
        if (!revealStartRef.current) return;
        const elapsed = Date.now() - revealStartRef.current;
        const remaining = Math.max(
          0,
          Math.ceil((TIMER_DURATION_MS - elapsed) / 1000),
        );
        setCountdownSecs(remaining);
      }, 1000);

      // Warning toast at T-5 s
      warningTimerRef.current = setTimeout(() => {
        Toast.show({
          type: 'info',
          text1: 'Secret key hiding soon',
          text2: 'Your secret key will be hidden in 5 seconds',
        });
      }, TIMER_DURATION_MS - WARNING_BEFORE_MS);

      // Auto-hide at T=30 s
      revealTimerRef.current = setTimeout(() => {
        maskSecret();
        Toast.show({
          type: 'info',
          text1: 'Secret key hidden',
          text2: 'Tap the eye icon to reveal again',
        });
      }, TIMER_DURATION_MS);

      setRevealedSecret(secret);
      setIsSecretRevealed(true);
      setCountdownSecs(TIMER_DURATION_MS / 1000);
    },
    [clearAllTimers, maskSecret],
  );

  const handleReveal = useCallback(async () => {
    try {
      const secret = await onRequestSecret();
      if (!secret) return;
      startRevealTimer(secret);
    } catch {
      // ignore
    }
  }, [onRequestSecret, startRevealTimer]);

  // ─── secure clipboard copy ─────────────────────────────────────────────────

  const handleCopyToClipboard = useCallback(async () => {
    const secret = revealedSecret ?? (await onRequestSecret());
    if (!secret) return;
    const ok = await copyToClipboard(secret);
    if (ok) {
      Toast.show({
        type: 'success',
        text1: 'Copied',
        text2: 'Clipboard will clear in 30s',
      });
    }
  }, [revealedSecret, onRequestSecret, copyToClipboard]);

  // ─── confirm step ──────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    const secret = revealedSecret ?? (await onRequestSecret());
    if (secret && confirmInput.trim() === secret) {
      // Persist the backup-confirmed flag via the hook so it round-trips
      // through SecureStore and survives app restart / rehydration.
      await confirmBackup();
      onBackupConfirmed();
      setStep('success');
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
  }, [revealedSecret, onRequestSecret, confirmInput, confirmBackup, onBackupConfirmed]);

  // ─── close handling ────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setStep('reveal');
    setIsSecretRevealed(false);
    setConfirmInput('');
    maskSecret();
    onClose();
  }, [maskSecret, onClose]);

  /**
   * Whether close is currently blocked.
   * Blocked when isOnboardingFlow=true and the user has not yet completed
   * the backup (i.e. step is not 'success').
   */
  const isClosingBlocked = isOnboardingFlow && step !== 'success';

  const handleRequestClose = useCallback(() => {
    if (isClosingBlocked) return; // swallow Android back gesture
    handleClose();
  }, [isClosingBlocked, handleClose]);

  const handleXPress = useCallback(() => {
    if (isClosingBlocked) return;
    handleClose();
  }, [isClosingBlocked, handleClose]);

  // ─── render helpers ────────────────────────────────────────────────────────

  const renderRevealStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="shield-outline" size={48} color="#09cc71" />
      </View>
      <Text style={styles.stepTitle}>Backup Your Wallet</Text>
      <Text style={styles.stepDescription}>
        Your secret key is the only way to recover your wallet. Please backup
        this key securely.
      </Text>

      <View style={styles.secretKeyContainer}>
        <View style={styles.secretKeyLabelRow}>
          <Text style={styles.secretKeyLabel}>Your Secret Key</Text>
          {isSecretRevealed && countdownSecs !== null && (
            <Text
              style={[
                styles.countdownText,
                countdownSecs <= 5 && styles.countdownTextUrgent,
              ]}
              accessibilityLabel={`Secret key hides in ${countdownSecs} seconds`}
            >
              {countdownSecs}s
            </Text>
          )}
        </View>
        <View style={styles.secretKeyBox}>
          {/*
           * selectable={false} prevents accidental long-press text selection
           * outside the intended copy flow on both platforms.
           */}
          <Text
            style={styles.secretKeyText}
            selectable={false}
            accessibilityLabel={
              isSecretRevealed ? 'Secret key revealed' : 'Secret key hidden'
            }
          >
            {isSecretRevealed ? (revealedSecret ?? '') : maskedKey}
          </Text>
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={handleReveal}
            accessibilityRole="button"
            accessibilityLabel={
              isSecretRevealed ? 'Hide secret key' : 'Reveal secret key'
            }
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
          Never share your secret key with anyone. Store it in a secure
          location.
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
          onPress={() => {
            maskSecret();
            setStep('confirm');
          }}
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
        <Ionicons
          name="checkmark-circle-outline"
          size={48}
          color="#09cc71"
        />
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
        <Ionicons
          name="information-circle-outline"
          size={20}
          color="#00D1FF"
        />
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
        Your wallet has been securely backed up. Remember to keep your secret
        key in a safe place.
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
      onRequestClose={handleRequestClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/*
           * X button is rendered but non-interactive (opacity 0.3) when
           * closing is blocked so the user has a visual cue that it exists
           * without being able to tap out.
           */}
          <TouchableOpacity
            style={[
              styles.closeButton,
              isClosingBlocked && styles.closeButtonBlocked,
            ]}
            onPress={handleXPress}
            accessibilityRole="button"
            accessibilityLabel="Close modal"
            accessibilityState={{ disabled: isClosingBlocked }}
            disabled={isClosingBlocked}
          >
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
  closeButtonBlocked: {
    opacity: 0.3,
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
  secretKeyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  secretKeyLabel: {
    color: '#A1A1A1',
    fontSize: 14,
    fontWeight: '600',
  },
  countdownText: {
    color: '#A1A1A1',
    fontSize: 13,
    fontWeight: '600',
  },
  countdownTextUrgent: {
    color: '#FFD700',
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

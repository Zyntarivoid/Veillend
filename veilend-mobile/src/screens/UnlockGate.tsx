/**
 * UnlockGate — rendered BEFORE any wallet data or auth tokens are read from
 * SecureStore. User must pass biometrics or enter 6-digit PIN to lift the
 * gate. The "Forgot PIN?" link wipes all SecureStore state and redirects
 * to ConnectWallet (safe re-onboarding via backup phrase).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppLockContext } from '../providers/AppLockProvider';
import { useStore } from '../store/store';
import { navigationRef } from '../navigation';

type Mode = 'gate' | 'pinEntry' | 'forgotConfirm';

const PIN_LENGTH = 6;

export default function UnlockGate() {
  const { state, unlock, tryBiometrics, tryPin, forgotPin } = useAppLockContext();
  const triggerHydrate = useStore((s) => s.triggerHydrationAfterUnlock);

  const [mode, setMode] = useState<Mode>('gate');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { biometricsEnabled, pinEnabled, biometricsHardwareAvailable } = state;

  // Whenever we enter PIN mode, auto-focus the input.
  useEffect(() => {
    if (mode === 'pinEntry') {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [mode]);

  // On first mount: if biometrics is the primary method, fire the prompt
  // immediately so the user doesn't have to tap anything extra.
  const didAutoBioRef = useRef(false);
  useEffect(() => {
    if (didAutoBioRef.current) return;
    if (!biometricsEnabled) return;
    if (!state.isLocked) return;
    didAutoBioRef.current = true;
    tryBiometrics().then((ok) => {
      if (ok) {
        unlock().then(() => triggerHydrate?.());
      } else if (!pinEnabled) {
        // Biometrics failed / cancelled and no PIN fallback → stay on gate
        // with manual biometrics retry button visible.
      }
    });
  }, [biometricsEnabled, state.isLocked, tryBiometrics, unlock, pinEnabled, triggerHydrate]);

  const handleBioPress = useCallback(async () => {
    const ok = await tryBiometrics();
    if (ok) {
      const unlocked = await unlock();
      if (unlocked) triggerHydrate?.();
    }
  }, [tryBiometrics, unlock, triggerHydrate]);

  const handlePinChange = useCallback((text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(digits);
    setPinError(null);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH) {
      setPinError('Enter your 6-digit PIN');
      return;
    }
    const ok = await tryPin(pin);
    if (!ok) {
      setPinError('Incorrect PIN. Try again.');
      setPin('');
      return;
    }
    setPin('');
    setPinError(null);
    const unlocked = await unlock(pin);
    if (unlocked) triggerHydrate?.();
  }, [pin, tryPin, unlock, triggerHydrate]);

  const handleForgotPin = useCallback(() => {
    Alert.alert(
      'Forgot PIN?',
      'For your security, there is no PIN recovery. All wallet data stored on this device will be permanently deleted. You will need to re-import your wallet using your backup phrase.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe & Reset',
          style: 'destructive',
          onPress: async () => {
            await forgotPin();
            // After wipe: redirect to ConnectWallet so the user can re-import.
            try {
              navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });
            } catch (e) {
              // nav might not be mounted yet; triggerHydrate still nulls state.
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [forgotPin]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <LinearGradient colors={['#0A0A0A', '#0D0014']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.content}>
            {/* Shield icon */}
            <View style={styles.shield}>
              <Ionicons name="lock-closed" size={44} color="#A855F7" />
            </View>

            <Text style={styles.title}>Veillend is locked</Text>
            <Text style={styles.subtitle}>
              {biometricsHardwareAvailable && biometricsEnabled
                ? 'Use Face ID / Touch ID or enter your PIN to unlock your wallet.'
                : pinEnabled
                ? 'Enter your 6-digit PIN to unlock your wallet.'
                : 'Authenticate to continue.'}
            </Text>

            {mode === 'gate' && (
              <View style={styles.actions}>
                {biometricsEnabled && biometricsHardwareAvailable && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleBioPress}
                    accessibilityRole="button"
                    accessibilityLabel="Unlock with biometrics"
                  >
                    <Ionicons name="finger-print" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>Unlock with Biometrics</Text>
                  </TouchableOpacity>
                )}

                {pinEnabled && (
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      biometricsEnabled && biometricsHardwareAvailable ? {} : styles.primaryButton,
                    ]}
                    onPress={() => setMode('pinEntry')}
                    accessibilityRole="button"
                    accessibilityLabel="Use 6-digit PIN"
                  >
                    <Ionicons
                      name="keypad-outline"
                      size={20}
                      color={
                        biometricsEnabled && biometricsHardwareAvailable ? '#A855F7' : '#fff'
                      }
                    />
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        !(biometricsEnabled && biometricsHardwareAvailable) &&
                          styles.primaryButtonText,
                      ]}
                    >
                      Use 6-Digit PIN
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {mode === 'pinEntry' && (
              <View style={styles.pinContainer}>
                {/* PIN dots */}
                <View style={styles.dotsRow}>
                  {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                    const filled = pin.length > i;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          filled && styles.dotFilled,
                          pinError && styles.dotError,
                        ]}
                      />
                    );
                  })}
                </View>

                {/* Hidden TextInput so we get the system keypad */}
                <TextInput
                  ref={inputRef}
                  value={pin}
                  onChangeText={handlePinChange}
                  onSubmitEditing={handlePinSubmit}
                  keyboardType="number-pad"
                  maxLength={PIN_LENGTH}
                  autoFocus
                  textContentType="oneTimeCode"
                  style={styles.hiddenInput}
                  accessibilityLabel="Enter 6-digit PIN"
                />

                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handlePinSubmit}
                  disabled={pin.length !== PIN_LENGTH}
                  accessibilityRole="button"
                  accessibilityLabel="Submit PIN"
                >
                  <Text style={styles.submitButtonText}>
                    {pin.length === PIN_LENGTH ? 'Unlock' : `Enter PIN (${pin.length}/${PIN_LENGTH})`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backLink}
                  onPress={() => {
                    setMode('gate');
                    setPin('');
                    setPinError(null);
                  }}
                >
                  <Text style={styles.backLinkText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.bottomSpacer} />

            <TouchableOpacity
              style={styles.forgotLink}
              onPress={handleForgotPin}
              accessibilityRole="button"
              accessibilityLabel="Forgot PIN? Wipe device data and re-import wallet"
            >
              <Text style={styles.forgotLinkText}>Forgot PIN?</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shield: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: '#A1A1A1',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
    paddingHorizontal: 12,
  },
  actions: { width: '100%', gap: 14 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#A855F7',
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.5)',
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
  },
  secondaryButtonText: {
    color: '#A855F7',
    fontSize: 16,
    fontWeight: '600',
  },
  pinContainer: { width: '100%', alignItems: 'center' },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#555',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    borderColor: '#A855F7',
    backgroundColor: '#A855F7',
  },
  dotError: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  pinError: {
    color: '#FF4D4D',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#09cc71',
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backLink: {
    marginTop: 20,
    paddingVertical: 6,
  },
  backLinkText: {
    color: '#888',
    fontSize: 14,
  },
  bottomSpacer: { flex: 1, maxHeight: 40 },
  forgotLink: {
    marginTop: 28,
    paddingVertical: 8,
  },
  forgotLinkText: {
    color: '#FF8A8A',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

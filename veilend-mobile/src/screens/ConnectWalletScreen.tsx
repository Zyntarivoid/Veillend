import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Clipboard,
} from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStellarAuth } from '../hooks/useStellarAuth';
import { WalletBackupModal } from '../components/WalletBackupModal';
import { useWalletSecurity } from '../hooks/useWalletSecurity';
import { validateSecretKey } from '../utils/validateSecretKey';

const { width } = Dimensions.get('window');

const PASTE_CLEAR_DELAY = 10_000;

type Mode = 'choose' | 'import';

export default function ConnectWalletScreen() {
  const { loading, error, generateWallet, importWallet, generatedSecretKey, clearGeneratedSecretKey } = useStellarAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [secretKey, setSecretKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const { isBackupRequired, confirmBackup } = useWalletSecurity();
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyValidation = validateSecretKey(secretKey);

  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1500 }),
        withTiming(1, { duration: 1500 }),
      ),
      -1,
      true,
    );
  }, []);

  // Clear paste timer on unmount
  useEffect(() => {
    return () => {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
    };
  }, []);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleGenerateWallet = async () => {
    await generateWallet();
    if (isBackupRequired()) {
      setShowBackupModal(true);
    }
  };

  const handleBackupConfirmed = async () => {
    await confirmBackup();
    setShowBackupModal(false);
    clearGeneratedSecretKey();
    setSecretKey('');
  };

  const handleImportWallet = async () => {
    const success = await importWallet(secretKey);
    if (success) {
      setSecretKey('');
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getString();
    const trimmed = text.trim();
    setSecretKey(trimmed);

    // Auto-clear clipboard after delay
    if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
    pasteTimerRef.current = setTimeout(() => {
      Clipboard.setString('');
      pasteTimerRef.current = null;
    }, PASTE_CLEAR_DELAY);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <LinearGradient
            colors={['#0A0A0A', '#001A0D']}
            style={StyleSheet.absoluteFill}
          />

          {/* Tagline */}
          <SafeAreaView style={styles.taglineContainer} edges={['top']}>
            <View style={styles.taglineWrapper}>
              <Text style={styles.taglineText}>Private Lending. Stellar Speed.</Text>
              <Ionicons name="shield-checkmark" size={16} color="#09cc71ff" style={styles.taglineIcon} />
            </View>
          </SafeAreaView>

          {/* Decorative cards */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(1000)}
            style={[styles.floatingCard, styles.card1]}
          >
            <LinearGradient
              colors={['rgba(9, 204, 113, 0.2)', 'rgba(9, 204, 113, 0.05)']}
              style={styles.cardGradient}
            >
              <View style={styles.cardChip} />
              <Text style={styles.cardText}>**** 4325</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(300).duration(1000)}
            style={[styles.floatingCard, styles.card2]}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.05)']}
              style={styles.cardGradient}
            >
              <View style={styles.cardChip} />
            </LinearGradient>
          </Animated.View>

          {/* Main content */}
          <Animated.View entering={FadeInDown.delay(500).duration(1000)} style={styles.content}>
            <View style={styles.titleWrapper}>
              <Text style={styles.mainTitle}>
                Lend crypto assets{'\n'}with ease on Stellar
              </Text>
            </View>

            {mode === 'choose' && (
              <>
                {/* Inline error banner for auth failures (e.g. 401/403 from verify) */}
                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning-outline" size={16} color="#ff6b6b" style={styles.errorBannerIcon} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                ) : null}

                <Animated.View style={[styles.connectButtonContainer, animatedButtonStyle]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleGenerateWallet}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Generate new Stellar wallet"
                  >
                    <LinearGradient
                      colors={['#09cc71', '#059652']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.connectButton}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? 'Connecting…' : 'Generate New Wallet'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  style={styles.importLink}
                  onPress={() => setMode('import')}
                  disabled={loading}
                >
                  <Text style={styles.importLinkText}>
                    Already have a wallet?{' '}
                    <Text style={styles.importLinkBold}>Import secret key</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'import' && (
              <>
                <View style={styles.inputWrapper}>
                  {/* Secret key input + eye toggle */}
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, styles.inputFlex]}
                      placeholder="Enter Stellar secret key (S…)"
                      placeholderTextColor="#555"
                      value={secretKey}
                      onChangeText={setSecretKey}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      secureTextEntry={!showKey}
                      accessibilityLabel="Import secret key"
                      returnKeyType="done"
                      onSubmitEditing={handleImportWallet}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowKey(v => !v)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={showKey ? 'Hide secret key' : 'Show secret key'}
                    >
                      <Ionicons
                        name={showKey ? 'eye-off' : 'eye'}
                        size={20}
                        color="#888"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Paste button */}
                  <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
                    <Ionicons name="clipboard-outline" size={14} color="#09cc71" />
                    <Text style={styles.pasteButtonText}>Paste</Text>
                  </TouchableOpacity>
                </View>

                {/* Real-time validation chip */}
                {secretKey.length > 0 && (
                  <View style={[styles.validationChip, keyValidation.valid ? styles.chipValid : styles.chipWarn]}>
                    <Text style={[styles.chipText, keyValidation.valid ? styles.chipTextValid : styles.chipTextWarn]}>
                      {keyValidation.valid ? 'Valid strkey ✔️' : keyValidation.error}
                    </Text>
                  </View>
                )}

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning-outline" size={16} color="#ff6b6b" style={styles.errorBannerIcon} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleImportWallet}
                  disabled={loading || !keyValidation.valid}
                >
                  <LinearGradient
                    colors={['#09cc71', '#059652']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.connectButton, styles.importButton, (!keyValidation.valid || loading) && styles.buttonDisabled]}
                  >
                    <Text style={styles.buttonText}>
                      {loading ? 'Connecting…' : 'Connect Wallet'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.importLink}
                  onPress={() => { setMode('choose'); setSecretKey(''); }}
                  disabled={loading}
                >
                  <Text style={styles.importLinkText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* Wallet Backup Modal */}
      <WalletBackupModal
        visible={showBackupModal}
        onRequestSecret={() => Promise.resolve(generatedSecretKey)}
        onClose={() => setShowBackupModal(false)}
        onBackupConfirmed={handleBackupConfirmed}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: '#0A0A0A',
    justifyContent: 'flex-end',
    padding: 24,
    paddingBottom: 48,
  },
  taglineContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    paddingRight: 24,
    paddingTop: 12,
    zIndex: 20,
  },
  taglineWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  taglineText: {
    color: '#D1D1D1',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  taglineIcon: {
    opacity: 0.8,
  },
  floatingCard: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    shadowColor: '#09cc71',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(26,26,26,0.6)',
  },
  card1: {
    top: '15%',
    right: -40,
    transform: [{ rotate: '15deg' }],
  },
  card2: {
    top: '25%',
    left: -20,
    transform: [{ rotate: '-5deg' }],
    zIndex: 2,
  },
  cardChip: {
    width: 40,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  cardText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: 'bold',
    alignSelf: 'flex-end',
  },
  content: {
    width: '100%',
    zIndex: 10,
  },
  titleWrapper: {
    marginBottom: 40,
  },
  mainTitle: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 54,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(9, 204, 113, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  connectButtonContainer: {
    width: '100%',
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#09cc71',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  connectButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  importButton: {
    marginBottom: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  importLink: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 8,
  },
  importLinkText: {
    color: '#666',
    textAlign: 'center',
    fontSize: 16,
  },
  importLinkBold: {
    color: '#09cc71',
    fontWeight: '600',
  },
  inputWrapper: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputFlex: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  eyeButton: {
    paddingLeft: 12,
    paddingVertical: 10,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  pasteButtonText: {
    color: '#09cc71',
    fontSize: 13,
    fontWeight: '500',
  },
  validationChip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
    borderWidth: 1,
  },
  chipWarn: {
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderColor: 'rgba(255, 165, 0, 0.4)',
  },
  chipValid: {
    backgroundColor: 'rgba(9, 204, 113, 0.1)',
    borderColor: 'rgba(9, 204, 113, 0.4)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextWarn: {
    color: '#FFA500',
  },
  chipTextValid: {
    color: '#09cc71',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerIcon: {
    flexShrink: 0,
  },
  errorBannerText: {
    color: '#ff6b6b',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});

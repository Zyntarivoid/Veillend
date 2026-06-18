import React, { useEffect, useState } from 'react';
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

const { width } = Dimensions.get('window');

type Mode = 'choose' | 'import';

export default function ConnectWalletScreen() {
  const { loading, error, generateWallet, importWallet } = useStellarAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [secretKey, setSecretKey] = useState('');

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

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                <Animated.View style={[styles.connectButtonContainer, animatedButtonStyle]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={generateWallet}
                    disabled={loading}
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
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Stellar secret key (S…)"
                    placeholderTextColor="#555"
                    value={secretKey}
                    onChangeText={setSecretKey}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    secureTextEntry={false}
                  />
                </View>

                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => importWallet(secretKey)}
                  disabled={loading || !secretKey.trim()}
                >
                  <LinearGradient
                    colors={['#09cc71', '#059652']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.connectButton, styles.importButton]}
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
    marginBottom: 16,
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
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
});

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import Toast from '../utils/toast';
import { useConnect, useAccount } from '@starknet-react/core';
import { useStarknetkitConnectModal } from 'starknetkit';
import { useStore } from '../store/store';
import api from '../utils/api';
import { constants } from 'starknet';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function ConnectWalletScreen() {
  const { connect, connectors } = useConnect();
  const { address, account } = useAccount();
  const { setAddress, requestNonce, verify, setAuthToken } = useStore();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as any,
  });

  const handleConnect = async () => {
    try {
        const { connector } = await starknetkitConnectModal();
        if (connector) {
            await connect({ connector });
        }
    } catch(e) {
        console.error("Connection failed", e);
    }
  };

  const handleBypass = () => {
    setAddress('0x0000000000000000000000000000000000000000000000000000000000000001');
    setAuthToken('mock-token-for-dev');
  };

  useEffect(() => {
    if (address && account) {
      authenticate();
    }
  }, [address, account]);

  const authenticate = async () => {
    try {
      if (!address || !account) return;
      setAddress(address);

      // 1. Get Nonce (via store helper)
      const nonce = await requestNonce(address);

      // 2. Sign Message
      const typedData = {
        types: {
          StarkNetDomain: [
            { name: 'name', type: 'felt' },
            { name: 'version', type: 'felt' },
            { name: 'chainId', type: 'felt' },
          ],
          Message: [
            { name: 'nonce', type: 'felt' }
          ],
        },
        primaryType: 'Message',
        domain: {
          name: 'VeilLend',
          version: '1',
          chainId: constants.StarknetChainId.SN_SEPOLIA,
        },
        message: {
          nonce: nonce,
        },
      };

      const signature = await account.signMessage(typedData);
      
      // 3. Verify (via store helper)
      const token = await verify({ address, signature, typedData, publicKey: address });
      if (token) setAuthToken(token);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Auth Failed', text2: 'Could not authenticate wallet. ' + (error?.message || '') });
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0A', '#1A0033']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Top Right Tagline */}
      <SafeAreaView style={styles.taglineContainer} edges={['top']}>
        <View style={styles.taglineWrapper}>
          <Text style={styles.taglineText}>Private Lending. Starknet Speed.</Text>
          <Ionicons name="shield-checkmark" size={16} color="#09cc71ff" style={styles.taglineIcon} />
        </View>
      </SafeAreaView>

      {/* Decorative Elements mimicking the cards in the design */}
      <Animated.View 
        entering={FadeInDown.delay(100).duration(1000)} 
        style={[styles.floatingCard, styles.card1]}
      >
         <LinearGradient
          colors={['rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.05)']}
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


      <Animated.View entering={FadeInDown.delay(500).duration(1000)} style={styles.content}>
        <View style={styles.titleWrapper}>
           <Text style={styles.mainTitle}>
            Lend crypto assest{"\n"}with ease on Starknet
          </Text>
          
        </View>
        
        <Animated.View style={[styles.connectButtonContainer, animatedButtonStyle]}>
           <TouchableOpacity 
            activeOpacity={0.8}
            onPress={handleConnect}
          >
            <LinearGradient
              colors={['#C084FC', '#A855F7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.connectButton}
            >
              <Text style={styles.buttonText}>Connect Wallet</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* <TouchableOpacity onPress={handleBypass}>
          <Text style={styles.loginText}>Already have an account? <Text style={styles.loginTextBold}>Log in</Text></Text>
        </TouchableOpacity> */}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  content: {
    width: '100%',
    zIndex: 10,
  },
  floatingCard: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    shadowColor: '#A855F7',
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
  titleWrapper: {
    marginBottom: 40,
    position: 'relative',
  },
  mainTitle: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 54,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(168, 85, 247, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  connectButtonContainer: {
    width: '100%',
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#A855F7',
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
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  loginText: {
    color: '#666',
    textAlign: 'center',
    fontSize: 16,
  },
  loginTextBold: {
    color: '#fff',
    fontWeight: '600',
  },
});

import { useState } from 'react';
import { Keypair } from '@stellar/stellar-base';
import { useStore } from '../store/store';
import * as SecureStoreShim from '../utils/secureStoreShim';

let SecureStore: typeof SecureStoreShim;
try {
  // @ts-ignore
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = SecureStoreShim as any;
}

const SECRET_KEY_STORE = 'stellar_secret_key';

export function useStellarAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requestNonce, verify, setAddress, setAuthToken } = useStore();

  const authenticate = async (keypair: Keypair) => {
    const walletAddress = keypair.publicKey();
    const nonce = await requestNonce(walletAddress);
    const signature = keypair.sign(Buffer.from(nonce)).toString('base64');
    const token = await verify({ walletAddress, nonce, signature });
    if (token) {
      setAddress(walletAddress);
      setAuthToken(token);
    }
  };

  const generateWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const keypair = Keypair.random();
      await SecureStore.setItemAsync(SECRET_KEY_STORE, keypair.secret());
      await authenticate(keypair);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate wallet');
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async (secretKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const keypair = Keypair.fromSecret(secretKey.trim());
      await SecureStore.setItemAsync(SECRET_KEY_STORE, keypair.secret());
      await authenticate(keypair);
    } catch (e: any) {
      setError(e?.message ?? 'Invalid secret key');
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, generateWallet, importWallet };
}

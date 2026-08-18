import { useState } from 'react';
import { Keypair } from '@stellar/stellar-base';
import { useStore } from '../store/store';
import { setSecureItem } from '../utils/secureStorage';

const SECRET_KEY_STORE = 'stellar_secret_key' as const;

export function useStellarAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(null);
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
    setGeneratedSecretKey(null);
    try {
      const keypair = Keypair.random();
      const secret = keypair.secret();
      await setSecureItem(SECRET_KEY_STORE, secret);
      setGeneratedSecretKey(secret);
      await authenticate(keypair);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate wallet');
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async (secretKey: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setGeneratedSecretKey(null);
    try {
      const keypair = Keypair.fromSecret(secretKey.trim());
      await setSecureItem(SECRET_KEY_STORE, keypair.secret());
      await authenticate(keypair);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Invalid secret key');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearGeneratedSecretKey = () => setGeneratedSecretKey(null);

  return {
    loading,
    error,
    generateWallet,
    importWallet,
    generatedSecretKey,
    clearGeneratedSecretKey,
  };
}
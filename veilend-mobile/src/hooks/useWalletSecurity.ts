import { useState, useEffect, useCallback } from 'react';
import { Keypair } from '@stellar/stellar-base';
import * as SecureStoreShim from '../utils/secureStoreShim';
import { Clipboard } from 'react-native';

let SecureStore: typeof SecureStoreShim;
try {
  // @ts-ignore
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = SecureStoreShim as any;
}

const SECRET_KEY_STORE = 'stellar_secret_key';
const BACKUP_FLAG_STORE = 'wallet_backup_confirmed';
const SECURE_TIMER_DURATION = 30000; // 30 seconds

type WalletSecurityState = {
  secretKey: string | null;
  isBackupConfirmed: boolean;
  isRevealActive: boolean;
  revealTimer: ReturnType<typeof setTimeout> | null;
};

export function useWalletSecurity() {
  const [state, setState] = useState<WalletSecurityState>({
    secretKey: null,
    isBackupConfirmed: false,
    isRevealActive: false,
    revealTimer: null,
  });

  // Load secret key and backup status on mount
  useEffect(() => {
    const loadWalletData = async () => {
      try {
        const [secretKey, backupConfirmed] = await Promise.all([
          SecureStore.getItemAsync(SECRET_KEY_STORE),
          SecureStore.getItemAsync(BACKUP_FLAG_STORE),
        ]);
        
        setState((prev) => ({
          ...prev,
          secretKey: secretKey || null,
          isBackupConfirmed: backupConfirmed === 'true',
        }));
      } catch (error) {
        console.error('Failed to load wallet security data:', error);
      }
    };
    
    loadWalletData();
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (state.revealTimer) {
        clearTimeout(state.revealTimer);
      }
    };
  }, [state.revealTimer]);

  const getSecretKey = useCallback(async (): Promise<string | null> => {
    try {
      const key = await SecureStore.getItemAsync(SECRET_KEY_STORE);
      return key || null;
    } catch (error) {
      console.error('Failed to get secret key:', error);
      return null;
    }
  }, []);

  const revealSecretKey = useCallback(async (): Promise<string | null> => {
    const key = await getSecretKey();
    if (!key) return null;

    // Set reveal active and start timer
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        isRevealActive: false,
        revealTimer: null,
      }));
    }, SECURE_TIMER_DURATION);

    setState((prev) => ({
      ...prev,
      isRevealActive: true,
      revealTimer: timer,
    }));

    return key;
  }, [getSecretKey]);

  const hideSecretKey = useCallback(() => {
    if (state.revealTimer) {
      clearTimeout(state.revealTimer);
    }
    setState((prev) => ({
      ...prev,
      isRevealActive: false,
      revealTimer: null,
    }));
  }, [state.revealTimer]);

  const confirmBackup = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(BACKUP_FLAG_STORE, 'true');
      setState((prev) => ({
        ...prev,
        isBackupConfirmed: true,
      }));
      return true;
    } catch (error) {
      console.error('Failed to confirm backup:', error);
      return false;
    }
  }, []);

  const isBackupRequired = useCallback((): boolean => {
    return !state.isBackupConfirmed && !!state.secretKey;
  }, [state.isBackupConfirmed, state.secretKey]);

  const clearRevealTimer = useCallback(() => {
    if (state.revealTimer) {
      clearTimeout(state.revealTimer);
      setState((prev) => ({
        ...prev,
        revealTimer: null,
        isRevealActive: false,
      }));
    }
  }, [state.revealTimer]);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await Clipboard.setString(text);
      // Set a timer to clear clipboard after 30 seconds (iOS/Android limitation)
      setTimeout(async () => {
        try {
          await Clipboard.setString('');
        } catch (e) {
          // Ignore clipboard clear errors
        }
      }, SECURE_TIMER_DURATION);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }, []);

  return {
    secretKey: state.secretKey,
    isBackupConfirmed: state.isBackupConfirmed,
    isRevealActive: state.isRevealActive,
    getSecretKey,
    revealSecretKey,
    hideSecretKey,
    confirmBackup,
    isBackupRequired,
    clearRevealTimer,
    copyToClipboard,
  };
}
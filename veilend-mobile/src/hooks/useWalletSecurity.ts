import { useState, useEffect, useCallback, useRef } from 'react';
import { Keypair } from '@stellar/stellar-base';
import * as SecureStoreShim from '../utils/secureStoreShim';
import { Clipboard } from 'react-native';
import { AppState, AppStateStatus } from 'react-native';

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
  // revealTimer is tracked via ref; state only tracks boolean
};

export function useWalletSecurity() {
  const [state, setState] = useState<WalletSecurityState>({
    secretKey: null,
    isBackupConfirmed: false,
    isRevealActive: false,
  });

  // Refs for timers so we can reliably clear them on unmount
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyClipboardTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Cleanup timers on unmount — clear reveal timer + any clipboard timers
  useEffect(() => {
    const cleanup = () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      copyClipboardTimersRef.current.forEach((t) => clearTimeout(t));
      copyClipboardTimersRef.current = [];
    };

    // AppState listener to wipe clipboard on background/inactive
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'inactive' || next === 'background') {
        try {
          Clipboard.setString('');
        } catch (e) {
          // ignore
        }
        cleanup();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      cleanup();
      try { sub.remove(); } catch (e) {}
    };
  }, []);

  const getSecretKey = useCallback(async (): Promise<string | null> => {
    try {
      const key = await SecureStore.getItemAsync(SECRET_KEY_STORE);
      return key || null;
    } catch (error) {
      console.error('Failed to get secret key:', error);
      return null;
    }
  }, []);

  // Expose a safe reveal flow: do not return raw secret into render paths.
  const withSigner = useCallback(async <T,>(
    work: (kp: Keypair, secret?: string) => Promise<T>,
  ): Promise<T | null> => {
    const secret = await getSecretKey();
    if (!secret) return null;
    let kp: Keypair | null = null;
    try {
      kp = Keypair.fromSecret(secret);

      // Mark reveal active while work runs
      setState((prev) => ({ ...prev, isRevealActive: true }));
      // start reveal timer
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
      revealTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, isRevealActive: false }));
        revealTimerRef.current = null;
      }, SECURE_TIMER_DURATION);

      const result = await work(kp, secret);
      return result;
    } finally {
      // Attempt to zero sensitive memory
      try {
        if (typeof TextEncoder !== 'undefined' && secret) {
          const enc = new TextEncoder();
          const arr = enc.encode(secret);
          arr.fill(0);
        }
      } catch (e) {
        // best-effort
      }
      try {
        if (typeof Buffer !== 'undefined' && secret) {
          const b = Buffer.from(secret);
          b.fill(0);
        }
      } catch (e) {}
      // clear reveal state
      setState((prev) => ({ ...prev, isRevealActive: false }));
    }
  }, [getSecretKey]);

  const hideSecretKey = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, isRevealActive: false }));
  }, []);

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
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, isRevealActive: false }));
  }, []);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await Clipboard.setString(text);
      // Set a timer to clear clipboard after 30 seconds (iOS/Android limitation)
      const t = setTimeout(async () => {
        try {
          await Clipboard.setString('');
        } catch (e) {
          // Ignore clipboard clear errors
        }
      }, SECURE_TIMER_DURATION);
      copyClipboardTimersRef.current.push(t);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }, []);

  // Expose a helper to immediately wipe the clipboard and clear timers
  const wipeClipboardNow = useCallback(async () => {
    try {
      await Clipboard.setString('');
    } catch (e) {}
    // clear pending timers
    copyClipboardTimersRef.current.forEach((t) => clearTimeout(t));
    copyClipboardTimersRef.current = [];
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, isRevealActive: false }));
  }, []);

  return {
    // Do not expose raw secretKey for render paths. Provide `withSigner` to run
    // ephemeral work with a Keypair instead.
    secretKey: state.secretKey,
    isBackupConfirmed: state.isBackupConfirmed,
    isRevealActive: state.isRevealActive,
    getSecretKey,
    revealSecretKey: undefined,
    withSigner,
    hideSecretKey,
    confirmBackup,
    isBackupRequired,
    clearRevealTimer,
    copyToClipboard,
    wipeClipboardNow,
  };
}
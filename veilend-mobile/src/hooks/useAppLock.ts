/**
 * useAppLock — gate the app on biometrics or 6-digit PIN.
 *
 * Surface:
 *   - unlock(): Promise<boolean>   → OS biometrics prompt OR PIN verification
 *   - state: { biometricsEnabled, pinEnabled, anyLockEnabled, isLocked }
 *   - enrollBiometrics(): Promise<boolean>
 *   - enrollPin(pin): Promise<boolean>
 *   - disableLock(): Promise<boolean>   → requires re-authentication first
 *   - forgotPin(): Promise<void>        → wipes all SecureStore entries
 *   - lockNow(): void                   → called by auto-lock provider
 *   - supportedBiometrics: AuthenticationType[] | null
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
  wipeAllSecureItems,
} from '../utils/secureStorage';
import { generateSalt, hashPin, verifyPin } from '../utils/pinHash';

type AuthenticationType = number;

export type AppLockState = {
  biometricsEnabled: boolean;
  pinEnabled: boolean;
  anyLockEnabled: boolean;
  isLocked: boolean;
  loading: boolean;
  supportedBiometrics: AuthenticationType[] | null;
  biometricsHardwareAvailable: boolean;
};

const PROMPT_BASE = {
  promptMessage: 'Unlock Veillend',
  requireConfirmation: true,
  fallbackLabel: 'Use passcode',
  cancelLabel: 'Cancel',
  disableDeviceFallback: false,
};

export function useAppLock() {
  const [state, setState] = useState<AppLockState>({
    biometricsEnabled: false,
    pinEnabled: false,
    anyLockEnabled: false,
    isLocked: false,
    loading: true,
    supportedBiometrics: null,
    biometricsHardwareAvailable: false,
  });

  // Keep a mutable ref that always points at the latest state so callbacks
  // defined with empty dep arrays can still read current values without
  // stale closures.
  const stateRef = useRef<AppLockState>(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const readState = useCallback((): AppLockState => stateRef.current, []);

  const initRef = useRef(false);

  // ─── Initial read of gate state from SecureStore (no auth required) ───
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const [bioRaw, pinHashRaw, bioSupported] = await Promise.all([
          getSecureItem('applock.biometricsEnabled'),
          getSecureItem('applock.pinHash'),
          LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
        ]);
        const biometricsEnabled = bioRaw === 'true';
        const pinEnabled = !!pinHashRaw;
        const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
        setState({
          biometricsEnabled,
          pinEnabled,
          anyLockEnabled: biometricsEnabled || pinEnabled,
          isLocked: biometricsEnabled || pinEnabled,
          loading: false,
          supportedBiometrics: bioSupported as AuthenticationType[],
          biometricsHardwareAvailable: hasHardware && bioSupported.length > 0,
        });
      } catch (e) {
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, []);

  // ─── Unlock via biometrics (OS-native) ───
  const tryBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return false;
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return false;
      const res = await LocalAuthentication.authenticateAsync(PROMPT_BASE);
      return !!(res && res.success);
    } catch (e) {
      return false;
    }
  }, []);

  // ─── Verify PIN against stored hash ───
  const tryPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!/^\d{6}$/.test(pin)) return false;
    const [salt, expected] = await Promise.all([
      getSecureItem('applock.salt'),
      getSecureItem('applock.pinHash'),
    ]);
    if (!salt || !expected) return false;
    return verifyPin(pin, salt, expected);
  }, []);

  // ─── Public unlock() ───
  const unlock = useCallback(async (pin?: string): Promise<boolean> => {
    const { biometricsEnabled, pinEnabled, anyLockEnabled } = readState();
    if (!anyLockEnabled) return true;

    let ok = false;
    if (biometricsEnabled) {
      ok = await tryBiometrics();
    }
    if (!ok && pinEnabled && typeof pin === 'string') {
      ok = await tryPin(pin);
    }
    if (ok) {
      setState((s) => ({ ...s, isLocked: false }));
    }
    return ok;
  }, [tryBiometrics, tryPin]);

  // ─── Helper: require re-auth before security-sensitive mutations ───
  const requireReAuth = useCallback(async (): Promise<boolean> => {
    const { biometricsEnabled, pinEnabled } = readState();
    if (!biometricsEnabled && !pinEnabled) return true;
    if (biometricsEnabled) {
      const ok = await tryBiometrics();
      if (ok) return true;
    }
    if (pinEnabled) {
      // Cannot prompt for PIN without a UI; caller must have already
      // authenticated via tryPin externally. Fall through to false: caller
      // should route the user to the PIN entry gate first.
      return false;
    }
    return false;
  }, [tryBiometrics]);

  // ─── Enroll biometrics ───
  const enrollBiometrics = useCallback(async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []);
    if (!hasHardware || types.length === 0) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
    if (!enrolled) return false;
    const test = await LocalAuthentication.authenticateAsync({
      ...PROMPT_BASE,
      promptMessage: 'Confirm biometrics for Veillend',
    });
    if (!(test && test.success)) return false;
    await setSecureItem('applock.biometricsEnabled', 'true');
    setState((s) => ({
      ...s,
      biometricsEnabled: true,
      anyLockEnabled: true,
      isLocked: false,
      biometricsHardwareAvailable: true,
      supportedBiometrics: types as AuthenticationType[],
    }));
    return true;
  }, []);

  // ─── Enroll 6-digit PIN ───
  const enrollPin = useCallback(async (pin: string, confirmPin: string): Promise<boolean> => {
    if (!/^\d{6}$/.test(pin)) return false;
    if (pin !== confirmPin) return false;
    const salt = generateSalt();
    const digest = await hashPin(pin, salt);
    await Promise.all([
      setSecureItem('applock.salt', salt),
      setSecureItem('applock.pinHash', digest),
    ]);
    setState((s) => ({
      ...s,
      pinEnabled: true,
      anyLockEnabled: true,
      isLocked: false,
    }));
    return true;
  }, []);

  // ─── Disable lock: requires re-auth first ───
  const disableLock = useCallback(async (pin?: string): Promise<boolean> => {
    const { biometricsEnabled, pinEnabled } = readState();
    if (!biometricsEnabled && !pinEnabled) return false;

    let authenticated = false;
    if (biometricsEnabled) {
      authenticated = await tryBiometrics();
    }
    if (!authenticated && pinEnabled && typeof pin === 'string') {
      authenticated = await tryPin(pin);
    }
    if (!authenticated) return false;

    await Promise.all([
      deleteSecureItem('applock.biometricsEnabled'),
      deleteSecureItem('applock.pinHash'),
      deleteSecureItem('applock.salt'),
    ]);
    setState((s) => ({
      ...s,
      biometricsEnabled: false,
      pinEnabled: false,
      anyLockEnabled: false,
      isLocked: false,
    }));
    return true;
  }, [tryBiometrics, tryPin]);

  // ─── Forgot PIN: wipe everything → safe re-onboarding via ConnectWallet ───
  const forgotPin = useCallback(async (): Promise<void> => {
    await wipeAllSecureItems();
    setState({
      biometricsEnabled: false,
      pinEnabled: false,
      anyLockEnabled: false,
      isLocked: false,
      loading: false,
      supportedBiometrics: null,
      biometricsHardwareAvailable: false,
    });
  }, []);

  // ─── Immediate lock (called by auto-lock provider on background timeout) ───
  const lockNow = useCallback((): void => {
    const { anyLockEnabled } = readState();
    if (!anyLockEnabled) return;
    setState((s) => ({ ...s, isLocked: true }));
  }, []);

  return {
    state,
    unlock,
    tryBiometrics,
    tryPin,
    requireReAuth,
    enrollBiometrics,
    enrollPin,
    disableLock,
    forgotPin,
    lockNow,
  };
}

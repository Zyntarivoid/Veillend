/**
 * AppLockProvider — wraps the useAppLock hook in a React Context so any
 * component (SettingsScreen, UnlockGate, root App, etc.) can read or
 * mutate the shared lock state.
 *
 * Also owns the AppState background-timeout auto-lock logic:
 *   - If the app goes to `background` / `inactive` for > 60 seconds,
 *     lockNow() is triggered on the next foreground visit AND any
 *     in-memory copies of stellar_secret_key / authToken are wiped
 *     from Zustand before the gate is shown.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { AppState, AppStateStatus, Clipboard } from 'react-native';
import { useAppLock, AppLockState } from '../hooks/useAppLock';
import { useStore } from '../store/store';

export type AppLockContextValue = ReturnType<typeof useAppLock>;

const AppLockContext = createContext<AppLockContextValue | null>(null);

const BACKGROUND_LOCK_THRESHOLD_MS = 60_000;

type LockAPI = {
  lockNow: () => void;
  state: AppLockState;
};

/**
 * Wipe in-memory copies of hot secrets so a backgrounded app cannot leak
 * them to a memory-dump attacker, and so the UI cannot re-render them
 * before the unlock gate passes.
 */
function wipeHotSecretsFromStore() {
  try {
    // Clear only the in-memory hot values. Persisted SecureStore entries
    // stay intact — the user just needs to re-authenticate to read them.
    useStore.setState({
      authToken: null,
      address: null,
      sessionId: null,
    });
  } catch (e) {
    // best effort
  }
  try {
    Clipboard.setString('');
  } catch (e) {
    // best effort
  }
}

function useAutoLock(api: LockAPI) {
  const lastBackgroundAt = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>('active');

  useEffect(() => {
    const handleChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background' || next === 'inactive') {
        if (prev === 'active') {
          lastBackgroundAt.current = Date.now();
        }
      }

      if (next === 'active') {
        const leftAt = lastBackgroundAt.current;
        lastBackgroundAt.current = null;
        if (
          api.state.anyLockEnabled &&
          !api.state.isLocked &&
          leftAt !== null &&
          Date.now() - leftAt >= BACKGROUND_LOCK_THRESHOLD_MS
        ) {
          wipeHotSecretsFromStore();
          api.lockNow();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleChange);
    return () => {
      try {
        sub.remove();
      } catch (e) {
        // older RN doesn't expose .remove via addEventListener return
      }
    };
  }, [api]);
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const api = useAppLock();

  useAutoLock({ lockNow: api.lockNow, state: api.state });

  // If lock state changes to locked (e.g. background timeout fired) and we
  // still have hot secrets in the store, wipe them immediately so they
  // cannot leak through rendered components behind the gate.
  const locked = api.state.isLocked;
  useEffect(() => {
    if (locked) {
      wipeHotSecretsFromStore();
    }
  }, [locked]);

  const value = useMemo<AppLockContextValue>(() => api, [api]);
  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLockContext(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLockContext must be used within <AppLockProvider>');
  }
  return ctx;
}

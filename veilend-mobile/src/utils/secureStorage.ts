import * as SecureStoreShim from './secureStoreShim';

export interface SecureStoreLike {
  getItemAsync: (key: string, options?: Record<string, unknown>) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: Record<string, unknown>) => Promise<void>;
  deleteItemAsync: (key: string, options?: Record<string, unknown>) => Promise<void>;
  WHEN_UNLOCKED?: string;
  AFTER_FIRST_UNLOCK?: string;
  ALWAYS?: string;
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY?: string;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: string;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: string;
  ALWAYS_THIS_DEVICE_ONLY?: string;
}

let SecureStore: SecureStoreLike;
try {
  // @ts-ignore -- optional native module; falls back to the in-memory shim below
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = SecureStoreShim as unknown as SecureStoreLike;
}

export type SecureStorageKey =
  | 'stellar_secret_key'
  | 'authToken'
  | 'address'
  | 'isPrivacyMode'
  | 'profileName'
  | 'profileImage'
  | 'currency'
  | 'notificationsEnabled'
  | 'wallet_backup_confirmed'
  | 'sessionId'
  | 'applock.biometricsEnabled'
  | 'applock.pinHash'
  | 'applock.salt';

type SecureStoreOptions = {
  keychainAccessible?: string;
  requireAuthentication?: boolean;
};

const GATE_ACCESSIBLE = (store: SecureStoreLike) => store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

/**
 * Per-key storage policy. Gate keys (applock.*) are always readable without
 * re-auth so the unlock gate can decide what kind of prompt to show before
 * lifting the gate on higher-value secrets.
 */
const KEY_OPTIONS: Record<SecureStorageKey, (store: SecureStoreLike) => SecureStoreOptions> = {
  // Highest-value secret in the app: gate reads behind device auth and
  // restrict the item to this device, wiped if the passcode is removed.
  // NOTE: requireAuthentication + WHEN_PASSCODE_SET_THIS_DEVICE_ONLY are
  // applied CONDITIONALLY at call-time when biometricsEnabled is true.
  // See setSecureItemWithAuthPolicy / getSecureItemWithAuthPolicy below.
  stellar_secret_key: (store) => ({
    keychainAccessible: store.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  }),
  authToken: (store) => ({
    keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }),
  address: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  isPrivacyMode: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  profileName: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  profileImage: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  currency: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  notificationsEnabled: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  wallet_backup_confirmed: (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  sessionId: (store) => ({
    keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }),
  // Gate-state keys: NEVER require authentication, or the unlock gate
  // cannot even render without first prompting the user — a UX dead-end.
  'applock.biometricsEnabled': (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  'applock.pinHash': (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
  'applock.salt': (store) => ({ keychainAccessible: GATE_ACCESSIBLE(store) }),
};

function getOptions(key: SecureStorageKey, store: SecureStoreLike): SecureStoreOptions {
  return (KEY_OPTIONS[key] ?? (() => ({})))(store);
}

function defaultFallback(key: SecureStorageKey, store: SecureStoreLike): SecureStoreOptions {
  return { keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
}

export async function setSecureItem(
  key: SecureStorageKey,
  value: string,
  store: SecureStoreLike = SecureStore,
): Promise<void> {
  const options = getOptions(key, store);
  try {
    await store.setItemAsync(key, value, options);
  } catch (err) {
    if (options.requireAuthentication) {
      console.warn(
        `[secureStorage] "${key}" could not be stored with requireAuthentication ` +
          '(likely no device passcode set). Downgrading to AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY.',
      );
      await store.setItemAsync(key, value, defaultFallback(key, store));
      return;
    }
    throw err;
  }
}

/**
 * Write stellar_secret_key with the elevated auth policy when the user has
 * opted in to biometrics/PIN. On iOS/Android this means the OS will prompt
 * for biometrics / device passcode on every read and the ciphertext is
 * inaccessible to root/jailbreak exploits that bypass the lock screen.
 */
export async function setSecretKeyWithLockPolicy(
  value: string,
  biometricsEnabled: boolean,
  store: SecureStoreLike = SecureStore,
): Promise<void> {
  const base = getOptions('stellar_secret_key', store);
  const opts: SecureStoreOptions = biometricsEnabled
    ? { ...base, requireAuthentication: true }
    : base;
  try {
    await store.setItemAsync('stellar_secret_key', value, opts);
  } catch (err) {
    if (opts.requireAuthentication) {
      console.warn(
        '[secureStorage] stellar_secret_key could not be stored with requireAuthentication ' +
          '(device passcode not enrolled?). Downgrading policy.',
      );
      await store.setItemAsync('stellar_secret_key', value, defaultFallback('stellar_secret_key', store));
      return;
    }
    throw err;
  }
}

export async function getSecureItem(
  key: SecureStorageKey,
  store: SecureStoreLike = SecureStore,
): Promise<string | null> {
  return store.getItemAsync(key, getOptions(key, store));
}

export async function deleteSecureItem(
  key: SecureStorageKey,
  store: SecureStoreLike = SecureStore,
): Promise<void> {
  return store.deleteItemAsync(key, getOptions(key, store));
}

/**
 * Wipe every SecureStore entry we know about. Called by the "Forgot PIN?"
 * safe-failure path so a locked-out user can never get into a state where
 * the app is gated forever with no recovery.
 */
export async function wipeAllSecureItems(store: SecureStoreLike = SecureStore): Promise<void> {
  const allKeys: SecureStorageKey[] = [
    'stellar_secret_key',
    'authToken',
    'address',
    'isPrivacyMode',
    'profileName',
    'profileImage',
    'currency',
    'notificationsEnabled',
    'wallet_backup_confirmed',
    'sessionId',
    'applock.biometricsEnabled',
    'applock.pinHash',
    'applock.salt',
  ];
  await Promise.all(allKeys.map((k) => store.deleteItemAsync(k, getOptions(k, store))));
}

// Centralized SecureStore wrapper. All SecureStore access must go through
// this module (enforced by the no-restricted-imports rule in
// eslint.config.mjs) so every key gets a deliberate keychain-accessibility /
// authentication policy instead of silently falling back to library
// defaults, which leave secrets readable any time the device is unlocked.
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
  | 'wallet_backup_confirmed';

type SecureStoreOptions = {
  keychainAccessible?: string;
  requireAuthentication?: boolean;
};

/**
 * Per-key storage policy, expressed against whichever store instance is
 * actually in use (the resolved module by default, or an injected one in
 * tests) — options must never be resolved against a *different* store's
 * accessibility constants than the one the read/write actually goes to.
 */
const KEY_OPTIONS: Record<SecureStorageKey, (store: SecureStoreLike) => SecureStoreOptions> = {
  // Highest-value secret in the app: gate reads behind device auth and
  // restrict the item to this device, wiped if the passcode is removed.
  stellar_secret_key: (store) => ({
    requireAuthentication: true,
    keychainAccessible: store.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  }),
  // Session token is sensitive but re-issuable; device-only, no biometric
  // prompt required on every read.
  authToken: (store) => ({
    keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }),
  address: () => ({}),
  isPrivacyMode: () => ({}),
  profileName: () => ({}),
  profileImage: () => ({}),
  currency: () => ({}),
  notificationsEnabled: () => ({}),
  wallet_backup_confirmed: () => ({}),
};

function getOptions(key: SecureStorageKey, store: SecureStoreLike): SecureStoreOptions {
  return (KEY_OPTIONS[key] ?? (() => ({})))(store);
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
    // Devices without a passcode/biometric enrolled can't satisfy
    // requireAuthentication + WHEN_PASSCODE_SET_THIS_DEVICE_ONLY — the OS
    // rejects the write. Downgrade rather than silently lose the value.
    if (options.requireAuthentication) {
      console.warn(
        `[secureStorage] "${key}" could not be stored with requireAuthentication ` +
          '(likely no device passcode set). Downgrading to AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY.',
      );
      await store.setItemAsync(key, value, {
        keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
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

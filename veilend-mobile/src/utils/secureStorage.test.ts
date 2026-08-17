import assert from 'node:assert/strict';
import test from 'node:test';
import type { SecureStoreLike } from './secureStorage';
import { setSecureItem, getSecureItem, deleteSecureItem } from './secureStorage';

// Under `tsx --test` (plain Node, no RN runtime) the module under test falls
// back to the in-memory shim automatically, since requiring the native
// expo-secure-store module throws outside React Native. That gives us a
// real, deterministic round-trip target for free.

test('set/get/delete round-trip through the default (shim) store', async () => {
  await setSecureItem('authToken', 'token-123');
  assert.equal(await getSecureItem('authToken'), 'token-123');

  await deleteSecureItem('authToken');
  assert.equal(await getSecureItem('authToken'), null);
});

test('stellar_secret_key is written with requireAuthentication + WHEN_PASSCODE_SET_THIS_DEVICE_ONLY', async () => {
  const calls: Array<{ key: string; value: string; options?: Record<string, unknown> }> = [];
  const fakeStore: SecureStoreLike = {
    setItemAsync: async (key, value, options) => {
      calls.push({ key, value, options });
    },
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'whenPasscodeSetThisDeviceOnly',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  };

  await setSecureItem('stellar_secret_key', 'S-SECRET', fakeStore);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.requireAuthentication, true);
});

test('authToken is written with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY and no auth requirement', async () => {
  const calls: Array<{ key: string; value: string; options?: Record<string, unknown> }> = [];
  const fakeStore: SecureStoreLike = {
    setItemAsync: async (key, value, options) => {
      calls.push({ key, value, options });
    },
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  };

  await setSecureItem('authToken', 'token-abc', fakeStore);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.requireAuthentication, undefined);
  assert.equal(calls[0].options?.keychainAccessible, 'afterFirstUnlockThisDeviceOnly');
});

test('stellar_secret_key downgrades to AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY when the device cannot satisfy requireAuthentication', async () => {
  const calls: Array<{ options?: Record<string, unknown> }> = [];
  const fakeStore: SecureStoreLike = {
    setItemAsync: async (_key, _value, options) => {
      calls.push({ options });
      if (options?.requireAuthentication) {
        throw new Error('Authentication not available (no device passcode set)');
      }
    },
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'whenPasscodeSetThisDeviceOnly',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  };

  const originalWarn = console.warn;
  let warned = false;
  console.warn = () => {
    warned = true;
  };
  try {
    await setSecureItem('stellar_secret_key', 'S-SECRET', fakeStore);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(calls.length, 2, 'expected an initial attempt and a downgraded retry');
  assert.equal(calls[0].options?.requireAuthentication, true);
  assert.equal(calls[1].options?.requireAuthentication, undefined);
  assert.equal(calls[1].options?.keychainAccessible, 'afterFirstUnlockThisDeviceOnly');
  assert.ok(warned, 'expected the downgrade to be logged');
});

test('a non-auth-related write failure is not swallowed by the downgrade path', async () => {
  const fakeStore: SecureStoreLike = {
    setItemAsync: async () => {
      throw new Error('disk full');
    },
    getItemAsync: async () => null,
    deleteItemAsync: async () => {},
  };

  await assert.rejects(() => setSecureItem('address', 'G...', fakeStore), /disk full/);
});

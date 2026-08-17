import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// All SecureStore access must go through src/utils/secureStorage.ts, which
// applies a deliberate per-key keychain-accessibility / authentication
// policy. Importing expo-secure-store anywhere else silently reverts to
// library defaults (item readable whenever the device is unlocked).
const NO_DIRECT_SECURE_STORE = {
  paths: [
    {
      name: 'expo-secure-store',
      message:
        'Import setSecureItem/getSecureItem/deleteSecureItem from "src/utils/secureStorage" instead of expo-secure-store directly.',
    },
  ],
};

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-restricted-imports': ['error', NO_DIRECT_SECURE_STORE],
      '@typescript-eslint/no-var-requires': 'error',
    },
  },
  {
    // The helper itself is the one allowed place to talk to expo-secure-store.
    files: ['src/utils/secureStorage.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

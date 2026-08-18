import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'eslint';
// @ts-ignore -- plain flat-config array, no type declarations needed here
import config from '../../eslint.config.mjs';

// eslint's flat-config type is stricter than the plain array literal in
// eslint.config.mjs infers to under `allowJs` — cast at the boundary rather
// than fight TS over a config object we already validate by using it live.
const flatConfig = config as any;

const DIRECT_IMPORT_SNIPPET = "import * as SecureStore from 'expo-secure-store';\nexport default SecureStore;\n";

function restrictedImportMessages(filename: string) {
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(DIRECT_IMPORT_SNIPPET, flatConfig, filename);
  return messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

test('a direct expo-secure-store import outside the helper is rejected by the lint rule', () => {
  const messages = restrictedImportMessages('src/screens/SomeScreen.ts');
  assert.ok(
    messages.length > 0,
    'expected no-restricted-imports to flag a direct expo-secure-store import',
  );
});

test('the secureStorage helper itself is exempt from the rule', () => {
  const messages = restrictedImportMessages('src/utils/secureStorage.ts');
  assert.equal(messages.length, 0);
});

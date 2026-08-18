import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const expectAll = (source: string, expectations: string[]) => {
  for (const expected of expectations) {
    assert.ok(source.includes(expected), `Expected source to contain: ${expected}`);
  }
};

test('Dashboard exposes critical accessibility semantics', () => {
  const source = read('screens/DashboardScreen.tsx');
  expectAll(source, [
    'accessibilityLabel="Toggle privacy mode"',
    'accessibilityState={{ checked: isPrivacyMode }}',
    'accessibilityLabel="Open profile menu"',
    'accessibilityLabel="Toggle balance visibility"',
    'accessibilityLabel={`${tx.type} of ${tx.amount} ${tx.asset} on ${tx.timestamp}`}',
  ]);
});

test('ConnectWallet exposes critical accessibility and keyboard semantics', () => {
  const source = read('screens/ConnectWalletScreen.tsx');
  expectAll(source, [
    "behavior={Platform.select({ ios: 'padding', android: 'height' })}",
    'accessibilityLabel="Generate new Stellar wallet"',
    'accessibilityLabel="Import secret key"',
    'returnKeyType="done"',
    'onSubmitEditing={handleImportWallet}',
  ]);
});

for (const [screen, action] of [['Deposit', 'deposit'], ['Borrow', 'borrow'], ['Repay', 'repay']] as const) {
  test(`${screen} exposes critical modal accessibility and keyboard semantics`, () => {
    const source = read(`screens/${screen}Screen.tsx`);
    expectAll(source, [
      "behavior={Platform.select({ ios: 'padding', android: 'height' })}",
      'returnKeyType="done"',
      `onSubmitEditing={confirm${screen}}`,
      'accessibilityLabel={`Use maximum ${',
      `accessibilityLabel="Cancel ${action}"`,
      `accessibilityLabel="Confirm ${action}"`,
    ]);
  });
}

test('Settings exposes critical accessibility semantics', () => {
  const source = read('screens/SettingsScreen.tsx');
  expectAll(source, [
    'accessibilityLabel="Change profile photo"',
    'accessibilityLabel="Save username"',
    'accessibilityLabel="Export wallet backup file"',
    'accessibilityRole="radio"',
    'accessibilityState={{ selected: currency === code }}',
  ]);
});

test('Global loading overlay and protocol banners announce screen-reader state', () => {
  const app = read('../App.tsx');
  const banners = read('components/ProtocolStatusBanners.tsx');
  expectAll(app, [
    "AccessibilityInfo.announceForAccessibility('Loading, please wait')",
    'accessibilityViewIsModal={true}',
    'accessibilityRole="progressbar"',
  ]);
  expectAll(banners, [
    'accessibilityLabel={banner.actionLabel}',
    "accessibilityHint={isWalletBanner ? 'Reconnect your wallet' : 'Retry protocol status sync'}",
  ]);
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Switch,
  Keyboard,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../store/store';
import { shortenAddress } from '../utils/helpers';
import Toast from '../utils/toast';
import { WalletExportModal } from '../components/WalletExportModal';
import { WalletBackupModal } from '../components/WalletBackupModal';
import { useWalletSecurity } from '../hooks/useWalletSecurity';
import { useAppLockContext } from '../providers/AppLockProvider';
import { navigationRef } from '../navigation';

const CURRENCIES = ['USD', 'EUR', 'GBP'];

export default function SettingsScreen({ navigation }: any) {
  const {
    address,
    profileName,
    profileImage,
    setProfileName,
    setProfileImage,
    currency,
    setCurrency,
    notificationsEnabled,
    setNotificationsEnabled,
    isPrivacyMode,
    togglePrivacyMode,
    logout,
    applySecretKeyLockPolicy,
  } = useStore();

  const { secretKey, isBackupConfirmed, withSigner, wipeClipboardNow } = useWalletSecurity() as any;
  const appLock = useAppLockContext();

  const [showExportModal, setShowExportModal] = useState(false);

  // ─── AppLock enrollment / disable modals ────────────────────────────────
  type WizardStep =
    | null
    | 'chooseMethod'
    | 'pinSet'
    | 'pinConfirm'
    | 'disableConfirm'
    | 'disablePin';

  const [wizard, setWizard] = useState<WizardStep>(null);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinDisable, setPinDisable] = useState('');
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);

  const defaultUsername = address ? shortenAddress(address) : 'Guest';
  const username = profileName ?? defaultUsername;
  const avatarUri = profileImage ?? undefined;

  const [tempName, setTempName] = useState(username);

  useEffect(() => {
    setTempName(username);
  }, [username]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const saveUsername = () => {
    Keyboard.dismiss();
    const nextName = tempName.trim();
    setProfileName(nextName.length > 0 ? nextName : null);
    Toast.show({ type: 'success', text1: 'Profile updated' });
  };

  const handleLogout = () => {
    Alert.alert(
      'Confirm Log Out',
      'Are you sure you want to log out? The secret key stored on this device will be permanently deleted. Ensure you have your backup saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await wipeClipboardNow();
            } catch (e) {}
            // logout() is async: calls POST /auth/logout to revoke the
            // server-side session then clears all local state. Fire-and-forget
            // so navigation resets immediately.
            logout().catch(() => {});
            navigationRef.reset({ index: 0, routes: [{ name: 'ConnectWallet' }] });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleExportWallet = () => {
    if (!isBackupConfirmed) {
      Toast.show({
        type: 'warning',
        text1: 'Backup Required',
        text2: 'Please backup your wallet before exporting',
      });
      return;
    }
    setShowExportModal(true);
  };

  // ─── AppLock: toggle on/off (top-level Switch press) ─────────────────
  const anyLockEnabled = appLock.state.anyLockEnabled;
  const { biometricsEnabled, pinEnabled } = appLock.state;

  const closeWizard = () => {
    setWizard(null);
    setPin1('');
    setPin2('');
    setPinDisable('');
    setWizardError(null);
    setWizardBusy(false);
  };

  const handleToggleAppLock = (next: boolean) => {
    if (next === anyLockEnabled) return;
    if (next) {
      // Turning ON → open enrollment wizard
      setPin1('');
      setPin2('');
      setWizardError(null);
      setWizard('chooseMethod');
    } else {
      // Turning OFF → require re-authentication
      if (biometricsEnabled) {
        setWizard('disableConfirm');
      } else if (pinEnabled) {
        setPinDisable('');
        setWizardError(null);
        setWizard('disablePin');
      }
    }
  };

  const handleEnrollBiometrics = async () => {
    setWizardBusy(true);
    setWizardError(null);
    try {
      const ok = await appLock.enrollBiometrics();
      if (!ok) {
        setWizardError(
          'Biometric authentication failed or is not enrolled on this device. Please enable biometrics in OS Settings first.',
        );
        return;
      }
      // Elevate the stellar_secret_key to OS-authenticated storage.
      await applySecretKeyLockPolicy(true);
      Toast.show({ type: 'success', text1: 'Biometrics enabled' });
      closeWizard();
    } finally {
      setWizardBusy(false);
    }
  };

  const handleBeginPinEnroll = () => {
    setPin1('');
    setPin2('');
    setWizardError(null);
    setWizard('pinSet');
  };

  const handlePinSetNext = () => {
    if (!/^\d{6}$/.test(pin1)) {
      setWizardError('Please enter 6 digits.');
      return;
    }
    if (/^(\d)\1{5}$/.test(pin1) || /^123456$|^000000$|^654321$/.test(pin1)) {
      setWizardError('Please choose a less predictable 6-digit PIN.');
      return;
    }
    setWizardError(null);
    setPin2('');
    setWizard('pinConfirm');
  };

  const handlePinConfirm = async () => {
    if (pin2 !== pin1) {
      setWizardError('PINs do not match. Please try again.');
      setPin2('');
      return;
    }
    setWizardBusy(true);
    try {
      const ok = await appLock.enrollPin(pin1, pin2);
      if (!ok) {
        setWizardError('Could not save PIN. Please try again.');
        return;
      }
      Toast.show({ type: 'success', text1: 'PIN set' });
      closeWizard();
    } finally {
      setWizardBusy(false);
    }
  };

  const handleDisableConfirm = async () => {
    setWizardBusy(true);
    setWizardError(null);
    try {
      // Biometrics re-auth path: pass no PIN
      const ok = await appLock.disableLock();
      if (!ok) {
        setWizardError('Authentication required to disable the lock.');
        return;
      }
      // Downgrade stellar_secret_key storage policy (no longer requires OS auth)
      await applySecretKeyLockPolicy(false);
      Toast.show({ type: 'success', text1: 'App lock disabled' });
      closeWizard();
    } finally {
      setWizardBusy(false);
    }
  };

  const handleDisableWithPin = async () => {
    if (!/^\d{6}$/.test(pinDisable)) {
      setWizardError('Enter your current 6-digit PIN.');
      return;
    }
    setWizardBusy(true);
    setWizardError(null);
    try {
      const ok = await appLock.disableLock(pinDisable);
      if (!ok) {
        setWizardError('Incorrect PIN.');
        setPinDisable('');
        return;
      }
      await applySecretKeyLockPolicy(false);
      Toast.show({ type: 'success', text1: 'App lock disabled' });
      closeWizard();
    } finally {
      setWizardBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Profile */}
      <Text style={styles.sectionTitle}>Profile</Text>
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <TouchableOpacity onPress={pickImage} style={styles.avatarContainer} accessibilityRole="button" accessibilityLabel="Change profile photo">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Ionicons name="person-circle" size={64} color="#A1A1A1" />
            )}
            <View style={styles.cameraIconBadge}>
              <Ionicons name="camera" size={14} color="#000" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.rowLabel}>Username</Text>
        <View style={styles.usernameRow}>
          <TextInput
            style={styles.nameInput}
            value={tempName}
            onChangeText={setTempName}
            placeholder={defaultUsername}
            placeholderTextColor="#555"
          />
          <TouchableOpacity
            onPress={saveUsername}
            style={styles.saveBtn}
            disabled={tempName.trim() === username}
            accessibilityRole="button"
            accessibilityLabel="Save username"
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
        {address ? <Text style={styles.walletAddress}>{shortenAddress(address)}</Text> : null}
      </View>

      {/* Security */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <View style={styles.securityStatus}>
          <View style={styles.securityStatusRow}>
            <Ionicons 
              name={isBackupConfirmed ? "checkmark-circle" : "alert-circle"} 
              size={24} 
              color={isBackupConfirmed ? "#09cc71" : "#FFD700"} 
            />
            <View style={styles.securityStatusText}>
              <Text style={styles.rowLabel}>Wallet Backup</Text>
              <Text style={styles.rowSubLabel}>
                {isBackupConfirmed 
                  ? 'Your wallet is securely backed up' 
                  : 'Please backup your wallet to secure access'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* App Lock toggle + status */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Require Biometrics / PIN</Text>
            <Text style={styles.rowSubLabel}>
              {anyLockEnabled
                ? biometricsEnabled && pinEnabled
                  ? 'Biometrics + 6-digit PIN required'
                  : biometricsEnabled
                  ? 'Biometrics required on launch'
                  : '6-digit PIN required on launch'
                : 'Tap to secure your wallet with biometrics or a PIN'}
            </Text>
          </View>
          <Switch
            value={anyLockEnabled}
            onValueChange={handleToggleAppLock}
            trackColor={{ false: '#333', true: '#09cc71' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Toggle require biometrics or PIN"
          />
        </View>

        <View style={styles.divider} />

        <TouchableOpacity 
          style={styles.securityAction}
          onPress={handleExportWallet}
          disabled={!isBackupConfirmed}
          accessibilityRole="button"
          accessibilityLabel="Export wallet backup file"
        >
          <View style={styles.securityActionLeft}>
            <Ionicons name="download-outline" size={20} color="#00D1FF" />
            <Text style={styles.securityActionText}>Export Wallet</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity 
          style={styles.securityAction}
          onPress={() => {
            Toast.show({
              type: 'info',
              text1: 'Reveal Secret Key',
              text2: 'Please use the wallet backup option to view your secret key',
            });
          }}
        >
          <View style={styles.securityActionLeft}>
            <Ionicons name="eye-outline" size={20} color="#00D1FF" />
            <Text style={styles.securityActionText}>Reveal Secret Key</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Currency</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map((code) => (
            <TouchableOpacity
              key={code}
              style={[styles.currencyChip, currency === code && styles.currencyChipActive]}
              onPress={() => setCurrency(code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: currency === code }}
              accessibilityLabel={`Select ${code} currency`}
            >
              <Text
                style={[
                  styles.currencyChipText,
                  currency === code && styles.currencyChipTextActive,
                ]}
              >
                {code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Notifications</Text>
            <Text style={styles.rowSubLabel}>Get notified about account activity</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#333', true: '#A855F7' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Toggle notifications"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Privacy Mode</Text>
            <Text style={styles.rowSubLabel}>Hide balances across the app</Text>
          </View>
          <Switch
            value={isPrivacyMode}
            onValueChange={togglePrivacyMode}
            trackColor={{ false: '#333', true: '#A855F7' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Toggle privacy mode"
          />
        </View>
      </View>

      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF4D4D" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 60 }} />

      {/* App Lock enrollment / disable wizard modal */}
      <Modal
        visible={wizard !== null}
        transparent
        animationType="fade"
        onRequestClose={closeWizard}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <View style={styles.modalCard}>
            {wizard === 'chooseMethod' && (
              <>
                <Text style={styles.modalTitle}>Secure Veillend</Text>
                <Text style={styles.modalSubtitle}>
                  Choose how to unlock the app. You can enable both for maximum protection.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.modalBigButton,
                    !appLock.state.biometricsHardwareAvailable && styles.modalBigButtonDisabled,
                  ]}
                  onPress={handleEnrollBiometrics}
                  disabled={!appLock.state.biometricsHardwareAvailable || wizardBusy}
                  accessibilityRole="button"
                >
                  <Ionicons name="finger-print" size={22} color="#fff" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalBigButtonTitle}>Use Biometrics</Text>
                    <Text style={styles.modalBigButtonSubtitle}>
                      {appLock.state.biometricsHardwareAvailable
                        ? 'Face ID / Touch ID / fingerprint'
                        : 'Biometric hardware not available or not enrolled'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBigButton, styles.modalBigButtonSecondary]}
                  onPress={handleBeginPinEnroll}
                  disabled={wizardBusy}
                  accessibilityRole="button"
                >
                  <Ionicons name="keypad-outline" size={22} color="#A855F7" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.modalBigButtonTitle, { color: '#fff' }]}>Set 6-Digit PIN</Text>
                    <Text style={styles.modalBigButtonSubtitle}>PIN fallback, always works</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCancel} onPress={closeWizard}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                {wizardBusy && <ActivityIndicator style={{ marginTop: 12 }} color="#A855F7" />}
                {wizardError ? <Text style={styles.modalError}>{wizardError}</Text> : null}
              </>
            )}

            {wizard === 'pinSet' && (
              <>
                <Text style={styles.modalTitle}>Create 6-Digit PIN</Text>
                <Text style={styles.modalSubtitle}>
                  Enter any 6 digits you can remember. If you forget it, you&apos;ll need to re-import your wallet from backup.
                </Text>
                <View style={styles.pinDotsRow}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View
                      key={i}
                      style={[styles.pinDot, pin1.length > i && styles.pinDotFilled]}
                    />
                  ))}
                </View>
                <TextInput
                  value={pin1}
                  onChangeText={(t) => {
                    setPin1(t.replace(/\D/g, '').slice(0, 6));
                    setWizardError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoFocus
                  style={styles.hiddenPinInput}
                />
                {wizardError ? <Text style={styles.modalError}>{wizardError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 }}>
                  <TouchableOpacity style={styles.modalSoftBtn} onPress={closeWizard}>
                    <Text style={styles.modalSoftBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, pin1.length !== 6 && styles.modalPrimaryBtnDisabled]}
                    onPress={handlePinSetNext}
                    disabled={pin1.length !== 6 || wizardBusy}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {wizard === 'pinConfirm' && (
              <>
                <Text style={styles.modalTitle}>Confirm 6-Digit PIN</Text>
                <Text style={styles.modalSubtitle}>Re-enter the same PIN to confirm.</Text>
                <View style={styles.pinDotsRow}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.pinDot,
                        pin2.length > i && styles.pinDotFilled,
                        wizardError && styles.pinDotError,
                      ]}
                    />
                  ))}
                </View>
                <TextInput
                  value={pin2}
                  onChangeText={(t) => {
                    setPin2(t.replace(/\D/g, '').slice(0, 6));
                    setWizardError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoFocus
                  style={styles.hiddenPinInput}
                />
                {wizardError ? <Text style={styles.modalError}>{wizardError}</Text> : null}
                {wizardBusy && <ActivityIndicator color="#09cc71" style={{ marginBottom: 8 }} />}
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 }}>
                  <TouchableOpacity
                    style={styles.modalSoftBtn}
                    onPress={() => setWizard('pinSet')}
                  >
                    <Text style={styles.modalSoftBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, pin2.length !== 6 && styles.modalPrimaryBtnDisabled]}
                    onPress={handlePinConfirm}
                    disabled={pin2.length !== 6 || wizardBusy}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Confirm & Enable</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {wizard === 'disableConfirm' && (
              <>
                <Text style={styles.modalTitle}>Turn Off App Lock?</Text>
                <Text style={styles.modalSubtitle}>
                  Confirm your identity to disable the lock. Anyone who picks up this device will be able to access your wallet.
                </Text>
                <TouchableOpacity
                  style={[styles.modalBigButton, { marginTop: 8 }]}
                  onPress={handleDisableConfirm}
                  disabled={wizardBusy}
                >
                  <Ionicons name="finger-print" size={22} color="#fff" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalBigButtonTitle}>Authenticate to Disable</Text>
                    <Text style={styles.modalBigButtonSubtitle}>Biometrics prompt</Text>
                  </View>
                </TouchableOpacity>
                {wizardBusy && <ActivityIndicator style={{ marginTop: 12 }} color="#FF4D4D" />}
                {wizardError ? <Text style={styles.modalError}>{wizardError}</Text> : null}
                <TouchableOpacity style={styles.modalCancel} onPress={closeWizard}>
                  <Text style={styles.modalCancelText}>Keep Lock Enabled</Text>
                </TouchableOpacity>
              </>
            )}

            {wizard === 'disablePin' && (
              <>
                <Text style={styles.modalTitle}>Confirm to Disable Lock</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your current 6-digit PIN. Anyone who picks up this device will be able to access your wallet.
                </Text>
                <View style={styles.pinDotsRow}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.pinDot,
                        pinDisable.length > i && styles.pinDotFilled,
                        wizardError && styles.pinDotError,
                      ]}
                    />
                  ))}
                </View>
                <TextInput
                  value={pinDisable}
                  onChangeText={(t) => {
                    setPinDisable(t.replace(/\D/g, '').slice(0, 6));
                    setWizardError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={styles.hiddenPinInput}
                />
                {wizardError ? <Text style={styles.modalError}>{wizardError}</Text> : null}
                {wizardBusy && <ActivityIndicator color="#FF4D4D" style={{ marginBottom: 8 }} />}
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 }}>
                  <TouchableOpacity style={styles.modalSoftBtn} onPress={closeWizard}>
                    <Text style={styles.modalSoftBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { backgroundColor: '#FF4D4D' }, pinDisable.length !== 6 && styles.modalPrimaryBtnDisabled]}
                    onPress={handleDisableWithPin}
                    disabled={pinDisable.length !== 6 || wizardBusy}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Disable Lock</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Wallet Export Modal */}
      <WalletExportModal
        visible={showExportModal}
        onRequestSecret={() =>
          // use withSigner to get the secret transiently
          withSigner(async (_kp: any, secret?: string | undefined) => secret || null)
        }
        onClose={() => setShowExportModal(false)}
      />
      <WalletBackupModal
        visible={showExportModal}
        onRequestSecret={() =>
          withSigner(async (_kp: any, secret?: string | undefined) => secret || null)
        }
        onClose={() => setShowExportModal(false)}
        onBackupConfirmed={() => {
          Toast.show({ type: 'success', text1: 'Backup confirmed' });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 24,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 24,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#00D1FF',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  avatarHint: {
    color: '#A1A1A1',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 16,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowSubLabel: {
    color: '#888',
    fontSize: 12,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  saveBtn: {
    backgroundColor: '#A855F7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  walletAddress: {
    color: '#666',
    fontSize: 12,
    marginTop: 10,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  currencyChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  currencyChipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#A855F7',
  },
  currencyChipText: {
    color: '#A1A1A1',
    fontWeight: '600',
    fontSize: 13,
  },
  currencyChipTextActive: {
    color: '#A855F7',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.2)',
  },
  logoutText: {
    color: '#FF4D4D',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  securityStatus: {
    marginBottom: 4,
  },
  securityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  securityStatusText: {
    flex: 1,
  },
  securityAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  securityActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  securityActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },

  // ─── App Lock wizard modal styles ──────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#121212',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 14,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#A1A1A1',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBigButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09cc71',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  modalBigButtonSecondary: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  modalBigButtonDisabled: {
    opacity: 0.45,
  },
  modalBigButtonTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalBigButtonSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  modalCancel: {
    paddingVertical: 8,
    marginTop: 4,
  },
  modalCancelText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  modalError: {
    color: '#FF4D4D',
    fontSize: 13,
    textAlign: 'center',
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
    marginBottom: 4,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#555',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    borderColor: '#09cc71',
    backgroundColor: '#09cc71',
  },
  pinDotError: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D',
  },
  hiddenPinInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  modalSoftBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  modalSoftBtnText: {
    color: '#A1A1A1',
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#09cc71',
    alignItems: 'center',
  },
  modalPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  modalPrimaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

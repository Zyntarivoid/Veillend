import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../store/store';
import { MOCK_USER } from '../data/mockData';
import { shortenAddress } from '../utils/helpers';
import Toast from '../utils/toast';

const DEFAULT_PROFILE_IMAGE = 'https://i.pravatar.cc/100?img=5';
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
  } = useStore();

  const defaultUsername = address ? shortenAddress(address) : MOCK_USER.name;
  const username = profileName ?? defaultUsername;
  const avatarUri = profileImage ?? DEFAULT_PROFILE_IMAGE;

  const [tempName, setTempName] = useState(username);

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
    logout();
    navigation.replace('ConnectWallet');
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
          <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
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
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
        {address ? <Text style={styles.walletAddress}>{shortenAddress(address)}</Text> : null}
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
});

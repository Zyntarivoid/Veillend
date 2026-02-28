import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, TextInput, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, Platform, Dimensions, FlatList } from 'react-native';
import api from '../utils/api';
import { useStore } from '../store/store';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { MOCK_USER, MOCK_TRANSACTIONS } from '../data/mockData';
import { shortenAddress } from '../utils/helpers';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 380;
const CARD_WIDTH = width - 48; // Padding 24 * 2


  
  const CARDS = [
    { label: 'Total Balance', value: MOCK_USER.balance, icon: 'wallet-outline' },
    { label: 'Collateral Value', value: 8000.00, icon: 'shield-checkmark-outline' },
    { label: 'Borrowed Value', value: 1000.00, icon: 'trending-down-outline' },
  ];

export default function DashboardScreen({ navigation }: any) {
  const { address, logout, isPrivacyMode, togglePrivacyMode } = useStore();
  const [data, setData] = useState(null as any);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Profile Menu State
  const [profileVisible, setProfileVisible] = useState(false);
  const [username, setUsername] = useState(address ? shortenAddress(address) : MOCK_USER.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(address ? shortenAddress(address) : MOCK_USER.name);
  const [profileImage, setProfileImage] = useState('https://i.pravatar.cc/100?img=5');

  useEffect(() => {
    if (address) {
      const shortAddr = shortenAddress(address);
      setUsername(shortAddr);
      setTempName(shortAddr);
    }
  }, [address]);

  const handleLogout = () => {
    setProfileVisible(false);
    logout();
    navigation.replace('ConnectWallet');
  };

  const saveUsername = () => {
    setUsername(tempName);
    setIsEditingName(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };
  
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // In a real app, you would fetch real data here
    // For now, we use the hardcoded mock data for UI demo
    setData({
      positions: [] 
    });
  };

  const ServiceButton = ({ icon, label, onPress }: any) => (
    <TouchableOpacity style={styles.serviceBtn} onPress={onPress}>
      <View style={styles.serviceIconBox}>
        <Ionicons name={icon} size={24} color="#A855F7" />
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const renderCard = ({ item }: { item: any }) => (
    <View style={{ width: CARD_WIDTH }}>
      <LinearGradient
        colors={['#A855F7', '#7C3AED']} // Soft linear gradient (from #A855F7 to #7C3AED)
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        {/* Faint radial glow simulation using a second gradient overlay */}
        <LinearGradient
          colors={['rgba(255,255,255,0.1)', 'transparent']}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Glassmorphism effect overlay */}
        <View style={styles.glassOverlay} />

        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardLabel}>{item.label}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceAmount}>
                {isPrivacyMode 
                  ? '****' 
                  : `$${item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                }
              </Text>
               {/* Masked number eye icon */}
              <Ionicons name={isPrivacyMode ? "eye-off-outline" : "eye-outline"} size={20} color="rgba(255,255,255,0.6)" style={{marginLeft: 10, marginTop: 12}} />
            </View>
          </View>
          
          {/* Added privacy shield top-right */}
          <View style={styles.privacyBadge}>
            <Ionicons name={item.icon as any} size={isSmallScreen ? 16 : 20} color="#00D1FF" />
            <Text style={styles.privacyText}>ZK Shielded</Text>
          </View>
        </View>
        
        {/* Bottom dots styled as small privacy "veils" with teal glow */}
         <View style={styles.cardNumberContainer}>
          <View style={[styles.privacyDot, { opacity: 0.6 }]} />
          <View style={[styles.privacyDot, { opacity: 0.8 }]} />
          <View style={[styles.privacyDot, { opacity: 1.0 }]} />
          <Text style={styles.cardNumber}>4325</Text>
        </View>
      </LinearGradient>
    </View>
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 18) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.userName}>{username}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={togglePrivacyMode} style={styles.iconButton}>
            <Ionicons name={isPrivacyMode ? "eye-off" : "eye"} size={24} color="#A1A1A1" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setProfileVisible(true)}>
            <Image 
              source={{ uri: profileImage }} 
              style={styles.avatar} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Menu Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={profileVisible}
        onRequestClose={() => setProfileVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setProfileVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Profile</Text>
                  <TouchableOpacity onPress={() => setProfileVisible(false)}>
                    <Ionicons name="close-circle" size={28} color="#A1A1A1" />
                  </TouchableOpacity>
                </View>

                {/* Profile Setup / Username */}
                <View style={styles.menuItem}>
                  <View style={styles.menuIconBox}>
                    <Ionicons name="person" size={20} color="#00D1FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>Username</Text>
                    {isEditingName ? (
                      <View style={styles.editNameContainer}>
                        <TextInput
                          style={styles.nameInput}
                          value={tempName}
                          onChangeText={setTempName}
                          autoFocus
                          placeholderTextColor="#555"
                        />
                        <TouchableOpacity onPress={saveUsername} style={styles.saveBtn}>
                          <Ionicons name="checkmark" size={18} color="#000" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.nameDisplayRow}>
                        <Text style={styles.menuValue}>{username}</Text>
                        <TouchableOpacity onPress={() => {
                          setTempName(username);
                          setIsEditingName(true);
                        }}>
                          <Ionicons name="pencil" size={16} color="#A855F7" style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {/* Change Profile Picture */}
                <TouchableOpacity style={styles.menuItem} onPress={pickImage}>
                  <View style={styles.menuIconBox}>
                    <Ionicons name="camera" size={20} color="#00D1FF" />
                  </View>
                  <View>
                    <Text style={styles.menuLabel}>Change Profile Picture</Text>
                    <Text style={styles.menuSubLabel}>Update your avatar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#555" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* Account Preference */}
                <TouchableOpacity style={styles.menuItem}>
                  <View style={styles.menuIconBox}>
                    <Ionicons name="settings" size={20} color="#A855F7" />
                  </View>
                  <View>
                    <Text style={styles.menuLabel}>Account Preferences</Text>
                    <Text style={styles.menuSubLabel}>Currency, Notifications, Privacy</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#555" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* Profile Setup (Generic) */}
                 <TouchableOpacity style={styles.menuItem}>
                  <View style={styles.menuIconBox}>
                    <Ionicons name="build" size={20} color="#A855F7" />
                  </View>
                  <View>
                    <Text style={styles.menuLabel}>Profile Setup</Text>
                    <Text style={styles.menuSubLabel}>Complete your KYC/Verification</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#555" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Log Out */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={20} color="#FF4D4D" />
                  <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Balance Card Carousel */}
      <View style={styles.balanceCardContainer}>
        <FlatList
          data={CARDS}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.label}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          extraData={isPrivacyMode}
        />
      </View>

      {/* Pagination Dots */}
      <View style={styles.paginationContainer}>
        {CARDS.map((_, index) => (
          <View 
            key={index} 
            style={[
              styles.dot, 
              currentIndex === index ? styles.activeDot : styles.inactiveDot
            ]} 
          />
        ))}
      </View>

      {/* Services Grid */}
      <Text style={styles.sectionTitle}>Services</Text>
      <View style={styles.servicesGrid}>
        <ServiceButton 
          icon="wallet-outline" 
          label="Deposit" 
          onPress={() => navigation.navigate('Deposit')} 
        />
        <ServiceButton 
          icon="cash-outline" 
          label="Borrow" 
          onPress={() => navigation.navigate('Borrow')} 
        />
        <ServiceButton 
          icon="card-outline" 
          label="Repay" 
          onPress={() => navigation.navigate('Repay')} 
        />
        <ServiceButton 
          icon="grid-outline" 
          label="More" 
          onPress={() => {}} 
        />
      </View>

      {/* Transactions List */}
      <Text style={styles.sectionTitle}>Transactions</Text>
      <View style={styles.transactionsList}>
        {MOCK_TRANSACTIONS.map((tx) => (
          <View key={tx.id} style={styles.txItem}>
            <View style={styles.txLeft}>
              <View style={styles.txIconBox}>
                <Ionicons name={tx.icon as any} size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.txTitle}>{tx.title}</Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
            </View>
            <Text style={styles.txValue}>{tx.value}</Text>
          </View>
        ))}
      </View>
      
      {/* Spacer for bottom tab bar */}
      <View style={{ height: 100 }} />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconButton: {
    padding: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
  },
  greeting: {
    color: '#A1A1A1',
    fontSize: 16,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#333',
  },
  balanceCardContainer: {
    borderRadius: 32,
    marginBottom: 16,
    shadowColor: '#A855F7', // Subtle purple shadow
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  balanceCard: {
    borderRadius: 32,
    padding: 24,
    height: 200,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent overlay
    // backdropFilter: 'blur(10px)', // Note: backdropFilter is web-only usually, simpler opacity used for mobile
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 4,
    letterSpacing: 0.5,
    fontFamily: 'System', // Use system sans-serif
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36, // Bolder/larger
    fontWeight: 'bold',
    textShadowColor: 'rgba(255, 255, 255, 0.4)', // Soft white glow
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: isSmallScreen ? 8 : 10,
    paddingVertical: isSmallScreen ? 4 : 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 209, 255, 0.3)', // Teal border
    shadowColor: '#00D1FF', // Teal glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  privacyText: {
    color: '#D1D1D1',
    fontSize: isSmallScreen ? 10 : 12,
    fontWeight: '600',
    marginLeft: isSmallScreen ? 4 : 6,
  },
  cardNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  privacyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D1FF', // Teal
    marginRight: 6,
    shadowColor: '#00D1FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  cardNumber: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    letterSpacing: 2,
    marginLeft: 4,
    fontWeight: '600',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: '#00D1FF',
  },
  inactiveDot: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  serviceBtn: {
    alignItems: 'center',
  },
  serviceIconBox: {
    width: 56,
    height: 56,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    color: '#A1A1A1',
    fontSize: 12,
  },
  transactionsList: {
    gap: 16,
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 16,
    borderRadius: 16,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  txIconBox: {
    width: 40,
    height: 40,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  txTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#00D1FF',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  editPhotoText: {
    color: '#A1A1A1',
    fontSize: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 16,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  menuSubLabel: {
    fontSize: 12,
    color: '#888',
  },
  menuValue: {
    fontSize: 16,
    color: '#ccc',
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#A855F7',
    paddingVertical: 4,
    marginRight: 10,
  },
  saveBtn: {
    backgroundColor: '#00D1FF',
    padding: 6,
    borderRadius: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 10,
    marginBottom: 20,
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
  txDate: {
    color: '#666',
    fontSize: 12,
  },
  txValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

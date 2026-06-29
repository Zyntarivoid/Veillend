import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import ConnectWalletScreen from '../screens/ConnectWalletScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DepositScreen from '../screens/DepositScreen';
import BorrowScreen from '../screens/BorrowScreen';
import RepayScreen from '../screens/RepayScreen';
import { useStore } from '../store/store';
import { Ionicons } from '@expo/vector-icons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#1A1A1A',
        },
        tabBarActiveTintColor: '#A855F7',
        tabBarInactiveTintColor: '#A1A1A1',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;
          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Deposit') iconName = focused ? 'arrow-down' : 'arrow-down-outline';
          else if (route.name === 'Borrow') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Repay') iconName = focused ? 'arrow-up' : 'arrow-up-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Deposit" component={DepositScreen} />
      <Tab.Screen name="Borrow" component={BorrowScreen} />
      <Tab.Screen name="Repay" component={RepayScreen} />
    </Tab.Navigator>
  );
}

/** Splash shown while session is being restored from SecureStore */
function SessionRestoreSplash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" color="#09cc71" />
    </View>
  );
}

export default function RootNavigator() {
  const authToken = useStore((state) => state.authToken);
  const sessionRestored = useStore((state) => state.sessionRestored);

  // Wait for session hydration before deciding which screen to show.
  // Without this, the ConnectWallet screen flashes briefly on every launch
  // even when the user has a persisted session.
  if (!sessionRestored) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SessionRestoreSplash} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!authToken ? (
          <Stack.Screen name="ConnectWallet" component={ConnectWalletScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

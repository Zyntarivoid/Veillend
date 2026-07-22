import React from 'react';
import { render } from '@testing-library/react-native';
import RootNavigator from './index';
import { useStore } from '../store/store';

// Mock the nested screens to simplify tests
jest.mock('../screens/ConnectWalletScreen', () => {
  const { View, Text } = require('react-native');
  return () => <View testID="connect-wallet-screen"><Text>Connect Wallet</Text></View>;
});

jest.mock('../screens/DashboardScreen', () => {
  const { View, Text } = require('react-native');
  return () => <View testID="dashboard-screen"><Text>Dashboard</Text></View>;
});

jest.mock('../screens/DepositScreen', () => {
  const { View, Text } = require('react-native');
  return () => <View testID="deposit-screen"><Text>Deposit</Text></View>;
});

jest.mock('../screens/BorrowScreen', () => {
  const { View, Text } = require('react-native');
  return () => <View testID="borrow-screen"><Text>Borrow</Text></View>;
});

jest.mock('../screens/RepayScreen', () => {
  const { View, Text } = require('react-native');
  return () => <View testID="repay-screen"><Text>Repay</Text></View>;
});

// Mock vector icons used in tabs
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('RootNavigator', () => {
  beforeEach(() => {
    // Reset store before each test
    useStore.setState({
      authToken: null,
      sessionRestored: false,
    });
  });

  it('renders SessionRestoreSplash when session is not yet restored', async () => {
    useStore.setState({ sessionRestored: false });
    
    const { getByTestId, queryByTestId } = await render(<RootNavigator />);
    
    expect(getByTestId('session-restore-splash')).toBeTruthy();
    expect(queryByTestId('connect-wallet-screen')).toBeNull();
    expect(queryByTestId('dashboard-screen')).toBeNull();
  });

  it('renders ConnectWalletScreen when session is restored but not authenticated', async () => {
    useStore.setState({ sessionRestored: true, authToken: null });
    
    const { getByTestId } = await render(<RootNavigator />);
    
    expect(getByTestId('connect-wallet-screen')).toBeTruthy();
  });

  it('renders MainTabs (Dashboard) when session is restored and authenticated', async () => {
    useStore.setState({ sessionRestored: true, authToken: 'fake-token' });
    
    const { getByTestId } = await render(<RootNavigator />);
    
    // Because MainTabs sets Dashboard as initial route, it should be rendered
    expect(getByTestId('dashboard-screen')).toBeTruthy();
  });
});

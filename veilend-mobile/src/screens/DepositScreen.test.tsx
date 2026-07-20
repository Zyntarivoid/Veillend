import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import DepositScreen from './DepositScreen';
import { useStore } from '../store/store';
import { MOCK_ASSETS } from '../data/mockData';

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('DepositScreen', () => {
  beforeEach(() => {
    useStore.setState({
      lendingLoading: false,
      lastLendingTx: null,
    });
    // Mock the deposit method
    useStore.setState({
      deposit: jest.fn().mockResolvedValue({ txHash: 'mock-tx' }),
    });
  });

  it('renders correctly with assets', async () => {
    const { getByText } = await render(<DepositScreen />);
    
    expect(getByText('Supply Market')).toBeTruthy();
    
    // Check if mock assets are rendered
    const firstAsset = MOCK_ASSETS[0];
    expect(getByText(firstAsset.name)).toBeTruthy();
    expect(getByText(firstAsset.symbol)).toBeTruthy();
  });

  it('opens deposit modal when an asset is pressed', async () => {
    const { getByTestId, queryByText, getByText } = await render(<DepositScreen />);
    
    const firstAsset = MOCK_ASSETS[0];
    
    // Modal title shouldn't be visible yet
    expect(queryByText(`Deposit ${firstAsset.symbol}`)).toBeNull();
    
    // Press the asset card
    await fireEvent.press(getByTestId(`asset-card-${firstAsset.symbol}`));
    
    // Now modal should be open
    expect(getByText(`Deposit ${firstAsset.symbol}`)).toBeTruthy();
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('calls store.deposit when confirmed', async () => {
    const { getByTestId } = await render(<DepositScreen />);
    
    const firstAsset = MOCK_ASSETS[0];
    
    // Open modal
    await fireEvent.press(getByTestId(`asset-card-${firstAsset.symbol}`));
    
    // Confirm deposit
    await act(async () => {
      await fireEvent.press(getByTestId('confirm-deposit-btn'));
    });
    
    // Check if deposit function was called with right asset symbol
    const depositFn = useStore.getState().deposit;
    expect(depositFn).toHaveBeenCalledWith(expect.objectContaining({
      asset: firstAsset.symbol
    }));
  });
});

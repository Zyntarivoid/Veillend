import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import BorrowScreen from './BorrowScreen';
import { useStore } from '../store/store';
import { MOCK_ASSETS } from '../data/mockData';

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('BorrowScreen', () => {
  beforeEach(() => {
    useStore.setState({
      lendingLoading: false,
      lastLendingTx: null,
    });
    // Mock the borrow method
    useStore.setState({
      borrow: jest.fn().mockResolvedValue({ txHash: 'mock-tx' }),
    });
  });

  it('renders correctly with assets', async () => {
    const { getByText } = await render(<BorrowScreen />);
    
    expect(getByText('Borrow Market')).toBeTruthy();
    
    // Check if mock assets are rendered
    const firstAsset = MOCK_ASSETS[0];
    expect(getByText(firstAsset.name)).toBeTruthy();
    expect(getByText(firstAsset.symbol)).toBeTruthy();
  });

  it('opens borrow modal when an asset is pressed', async () => {
    const { getByTestId, queryByText, getByText } = await render(<BorrowScreen />);
    
    const firstAsset = MOCK_ASSETS[0];
    
    // Modal title shouldn't be visible yet
    expect(queryByText(`Borrow ${firstAsset.symbol}`)).toBeNull();
    
    // Press the asset card
    await fireEvent.press(getByTestId(`asset-card-${firstAsset.symbol}`));
    
    // Now modal should be open
    expect(getByText(`Borrow ${firstAsset.symbol}`)).toBeTruthy();
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('calls store.borrow when confirmed', async () => {
    const { getByTestId } = await render(<BorrowScreen />);
    
    const firstAsset = MOCK_ASSETS[0];
    
    // Open modal
    await fireEvent.press(getByTestId(`asset-card-${firstAsset.symbol}`));
    
    // Confirm borrow
    await act(async () => {
      await fireEvent.press(getByTestId('confirm-borrow-btn'));
    });
    
    // Check if borrow function was called with right asset symbol
    const borrowFn = useStore.getState().borrow;
    expect(borrowFn).toHaveBeenCalledWith(expect.objectContaining({
      asset: firstAsset.symbol
    }));
  });
});

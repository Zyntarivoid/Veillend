import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { useWallet } from '@/context/WalletContext';
import { WalletConnect } from '@/components/WalletConnect';
import { WalletStatus } from '@/components/WalletStatus';

vi.mock('@/context/WalletContext', () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
  useWallet: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);

describe('WalletStatus', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockedUseWallet.mockReturnValue({
      address: null,
      publicKey: null,
      isConnected: false,
      isAuthenticated: false,
      isInstalled: true,
      isLoading: true,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletStatus />);

    expect(screen.getByText(/Initializing wallet/i)).toBeInTheDocument();
  });

  it('renders error state with details', () => {
    mockedUseWallet.mockReturnValue({
      address: null,
      publicKey: null,
      isConnected: false,
      isAuthenticated: false,
      isInstalled: true,
      isLoading: false,
      error: 'Freighter wallet not found',
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletStatus showDetails />);

    expect(screen.getByText(/Wallet error/i)).toBeInTheDocument();
    expect(screen.getByText(/Freighter wallet not found/i)).toBeInTheDocument();
  });

  it('renders connected state with details', () => {
    mockedUseWallet.mockReturnValue({
      address: 'GABCDEF1234567890',
      publicKey: 'GABCDEF1234567890',
      isConnected: true,
      isAuthenticated: true,
      isInstalled: true,
      isLoading: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletStatus showDetails />);

    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    expect(screen.getByText('GABCDE...7890')).toBeInTheDocument();
  });

  it('renders not connected state', () => {
    mockedUseWallet.mockReturnValue({
      address: null,
      publicKey: null,
      isConnected: false,
      isAuthenticated: false,
      isInstalled: true,
      isLoading: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletStatus />);

    expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
  });
});

describe('WalletConnect', () => {
  beforeEach(() => {
    (window as any).freighter = {
      isConnected: async () => ({ isConnected: true }),
      getAddress: async () => ({ address: 'GABCDEF1234567890' }),
      signTransaction: async () => ({ signedTxXdr: 'dummy' }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).freighter;
  });

  it('renders connect wallet button when wallet is not connected', () => {
    mockedUseWallet.mockReturnValue({
      address: null,
      publicKey: null,
      isConnected: false,
      isAuthenticated: false,
      isInstalled: true,
      isLoading: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletConnect />);

    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('opens modal and triggers connect action', async () => {
    const connectMock = vi.fn().mockResolvedValue(undefined);
    mockedUseWallet.mockReturnValue({
      address: null,
      publicKey: null,
      isConnected: false,
      isAuthenticated: false,
      isInstalled: true,
      isLoading: false,
      error: null,
      connect: connectMock,
      disconnect: vi.fn(),
      clearError: vi.fn(),
    });

    render(<WalletConnect />);

    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(screen.getByRole('heading', { name: /Connect Wallet/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }));

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalled();
    });
  });

  it('renders connected state and disconnects', async () => {
    const disconnectMock = vi.fn().mockResolvedValue(undefined);

    mockedUseWallet.mockReturnValue({
      address: 'GABCDEF1234567890',
      publicKey: 'GABCDEF1234567890',
      isConnected: true,
      isAuthenticated: true,
      isInstalled: true,
      isLoading: false,
      error: null,
      connect: vi.fn(),
      disconnect: disconnectMock,
      clearError: vi.fn(),
    });

    render(<WalletConnect />);

    expect(screen.getByText('GABCDE...7890')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));

    await waitFor(() => {
      expect(disconnectMock).toHaveBeenCalled();
    });
  });
});

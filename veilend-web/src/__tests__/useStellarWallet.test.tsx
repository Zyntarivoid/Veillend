import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStellarWallet } from '@/hooks/useStellarWallet';
import * as auth from '@/lib/stellar/auth';
import * as walletLib from '@/lib/stellar/wallet';

vi.mock('@/lib/stellar/auth', () => ({
  isWalletAuthenticated: vi.fn(),
  getAuthenticatedWallet: vi.fn(),
  createAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
}));

vi.mock('@/lib/stellar/wallet', () => ({
  connectFreighter: vi.fn(),
  isFreighterInstalled: vi.fn(),
  disconnectWallet: vi.fn(),
}));

function WalletHookHarness() {
  const wallet = useStellarWallet();

  return (
    <div>
      <div data-testid="address">{wallet.address ?? 'null'}</div>
      <div data-testid="publicKey">{wallet.publicKey ?? 'null'}</div>
      <div data-testid="isConnected">{String(wallet.isConnected)}</div>
      <div data-testid="isAuthenticated">{String(wallet.isAuthenticated)}</div>
      <div data-testid="isInstalled">{String(wallet.isInstalled)}</div>
      <div data-testid="isLoading">{String(wallet.isLoading)}</div>
      <div data-testid="error">{wallet.error ?? 'null'}</div>
      <button type="button" onClick={wallet.connect}>connect</button>
      <button type="button" onClick={wallet.disconnect}>disconnect</button>
      <button type="button" onClick={wallet.clearError}>clear-error</button>
    </div>
  );
}

const mockedAuth = vi.mocked(auth, { shallow: true });
const mockedWalletLib = vi.mocked(walletLib, { shallow: true });

describe('useStellarWallet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedAuth.isWalletAuthenticated.mockReset();
    mockedAuth.getAuthenticatedWallet.mockReset();
    mockedAuth.createAuthSession.mockReset();
    mockedAuth.clearAuthSession.mockReset();
    mockedWalletLib.isFreighterInstalled.mockReset();
    mockedWalletLib.connectFreighter.mockReset();
    mockedWalletLib.disconnectWallet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with wallet installation state and unauthenticated session', async () => {
    mockedWalletLib.isFreighterInstalled.mockReturnValue(true);
    mockedAuth.isWalletAuthenticated.mockReturnValue(false);
    mockedAuth.getAuthenticatedWallet.mockReturnValue(null);

    render(<WalletHookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('isConnected')).toHaveTextContent('false');
    expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('connects successfully and creates an auth session', async () => {
    mockedWalletLib.isFreighterInstalled.mockReturnValue(true);
    mockedAuth.isWalletAuthenticated.mockReturnValue(false);
    mockedAuth.getAuthenticatedWallet.mockReturnValue(null);
    mockedWalletLib.connectFreighter.mockResolvedValue({ address: 'GTESTADDRESS', publicKey: 'GTESTADDRESS' });
    mockedAuth.createAuthSession.mockReturnValue({ address: 'GTESTADDRESS', publicKey: 'GTESTADDRESS', authenticated: true });

    render(<WalletHookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('isConnected')).toHaveTextContent('true');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('address')).toHaveTextContent('GTESTADDRESS');
      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });

    expect(mockedAuth.createAuthSession).toHaveBeenCalledWith('GTESTADDRESS', 'GTESTADDRESS');
  });

  it('disconnects and clears auth session', async () => {
    mockedWalletLib.isFreighterInstalled.mockReturnValue(true);
    mockedAuth.isWalletAuthenticated.mockReturnValue(true);
    mockedAuth.getAuthenticatedWallet.mockReturnValue('GTESTADDRESS');
    mockedWalletLib.disconnectWallet.mockResolvedValue();

    render(<WalletHookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('isConnected')).toHaveTextContent('false');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('address')).toHaveTextContent('null');
    });

    expect(mockedAuth.clearAuthSession).toHaveBeenCalled();
  });

  it('sets error state when connect fails', async () => {
    mockedWalletLib.isFreighterInstalled.mockReturnValue(true);
    mockedAuth.isWalletAuthenticated.mockReturnValue(false);
    mockedAuth.getAuthenticatedWallet.mockReturnValue(null);
    mockedWalletLib.connectFreighter.mockRejectedValue(new Error('Freighter unavailable'));

    render(<WalletHookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('isInstalled')).toHaveTextContent('true');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Freighter unavailable');
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      expect(screen.getByTestId('isConnected')).toHaveTextContent('false');
    });
  });
});

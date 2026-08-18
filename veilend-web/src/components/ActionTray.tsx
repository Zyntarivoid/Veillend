'use client';

import * as React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AmountInput } from '@/components/AmountInput';
import { ActivityActionType, PortfolioData } from '@/lib/types/dashboard';
import { ValidationResult, ValidationContext } from '@/lib/validation/amount';
import { fetchSupportedAssets, SupportedAsset } from '@/lib/api/assets';
import {
  executeDeposit,
  executeWithdraw,
  executeBorrow,
  executeRepay,
  ActionResponse,
  MappedContractError,
} from '@/lib/actions';
import { useDashboardStore } from '@/lib/store/useDashboardStore';

export interface ActionTrayProps {
  userAddress?: string;
  portfolio?: PortfolioData;
  onActionSuccess?: () => void;
}

export function ActionTray({ userAddress, portfolio, onActionSuccess }: ActionTrayProps) {
  const [activeAction, setActiveAction] = React.useState<ActivityActionType | null>(null);
  const [supportedAssets, setSupportedAssets] = React.useState<SupportedAsset[]>([]);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = React.useState<string>('USDC');
  const [amountInput, setAmountInput] = React.useState<string>('');
  const [validity, setValidity] = React.useState<ValidationResult>({ valid: false });
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [statusStep, setStatusStep] = React.useState<string | null>(null);
  const [errorAlert, setErrorAlert] = React.useState<MappedContractError | null>(null);

  const dashboardStore = useDashboardStore();

  // Load supported assets on mount or address change
  React.useEffect(() => {
    fetchSupportedAssets(userAddress).then((assets) => {
      setSupportedAssets(assets);
      if (assets.length > 0 && !assets.some((a) => a.symbol === selectedAssetSymbol)) {
        setSelectedAssetSymbol(assets[0].symbol);
      }
    });
  }, [userAddress, selectedAssetSymbol]);

  const selectedAsset = React.useMemo(() => {
    return (
      supportedAssets.find((a) => a.symbol === selectedAssetSymbol) || {
        symbol: 'USDC',
        name: 'USD Coin',
        contractId: 'CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD',
        decimals: 7,
        priceUsd: 1.0,
        walletBalance: 1000.0,
        depositedBalance: 500.0,
        borrowedBalance: 0.0,
        isSupported: true,
      }
    );
  }, [supportedAssets, selectedAssetSymbol]);

  const handleOpenModal = (action: ActivityActionType) => {
    setActiveAction(action);
    setAmountInput('');
    setValidity({ valid: false });
    setErrorAlert(null);
    setStatusStep(null);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setActiveAction(null);
    setAmountInput('');
    setErrorAlert(null);
  };

  // Shortcut calculation (MAX / 50% / HALF)
  const handleApplyShortcut = (percentage: number) => {
    if (!selectedAsset) return;

    let maxAmount = 0;
    if (activeAction === 'DEPOSIT') {
      maxAmount = selectedAsset.walletBalance;
    } else if (activeAction === 'WITHDRAW') {
      maxAmount = selectedAsset.depositedBalance || selectedAsset.walletBalance;
    } else if (activeAction === 'BORROW') {
      const remainingBorrowLimitUsd = Math.max(
        0,
        (portfolio?.totalDepositedUsd ?? 1000) * 0.8 - (portfolio?.totalBorrowedUsd ?? 0),
      );
      maxAmount = remainingBorrowLimitUsd / (selectedAsset.priceUsd || 1);
    } else if (activeAction === 'REPAY') {
      const debt = selectedAsset.borrowedBalance;
      maxAmount = Math.min(debt > 0 ? debt : selectedAsset.walletBalance, selectedAsset.walletBalance);
    }

    const calculated = (maxAmount * percentage).toFixed(4);
    // Strip trailing zeroes if clean decimal
    const cleanStr = String(parseFloat(calculated));
    setAmountInput(cleanStr);
  };

  // Portfolio context for AmountInput validation
  const validationCtx: ValidationContext = React.useMemo(() => {
    const borrowLimitUsd = Math.max(
      0,
      (portfolio?.totalDepositedUsd ?? 1000) * 0.8 - (portfolio?.totalBorrowedUsd ?? 0),
    );

    return {
      availableBalance:
        activeAction === 'WITHDRAW'
          ? selectedAsset.depositedBalance || selectedAsset.walletBalance
          : selectedAsset.walletBalance,
      borrowLimitUsd,
      outstandingDebt: selectedAsset.borrowedBalance,
      priceUsd: selectedAsset.priceUsd,
      decimals: selectedAsset.decimals,
    };
  }, [activeAction, selectedAsset, portfolio]);

  // Health factor preview calculation for Borrow & Withdraw actions
  const healthFactorPreview = React.useMemo(() => {
    if (!portfolio || (activeAction !== 'BORROW' && activeAction !== 'WITHDRAW')) {
      return null;
    }

    const parsedNum = parseFloat(amountInput) || 0;
    if (parsedNum <= 0) return null;

    const currentDeposited = portfolio.totalDepositedUsd;
    const currentBorrowed = portfolio.totalBorrowedUsd;
    const currentHF = portfolio.healthFactor;

    const assetUsdValue = parsedNum * selectedAsset.priceUsd;

    let nextDeposited = currentDeposited;
    let nextBorrowed = currentBorrowed;

    if (activeAction === 'BORROW') {
      nextBorrowed += assetUsdValue;
    } else if (activeAction === 'WITHDRAW') {
      nextDeposited = Math.max(0, currentDeposited - assetUsdValue);
    }

    const nextHF =
      nextBorrowed === 0
        ? Infinity
        : Math.min((nextDeposited * 0.8) / nextBorrowed, 99.99);

    return {
      currentHF,
      nextHF,
      isRisky: nextHF < 1.1 && nextHF !== Infinity,
    };
  }, [portfolio, activeAction, amountInput, selectedAsset]);

  // Handle submit action pipeline
  const handleSubmitAction = async () => {
    if (!activeAction || !userAddress || !validity.valid || isSubmitting) return;

    const parsedAmount = parseFloat(amountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsSubmitting(true);
    setErrorAlert(null);

    // Apply Optimistic Local Store Mutation
    const pendingId = dashboardStore.applyOptimisticAction(
      activeAction,
      selectedAsset.symbol,
      parsedAmount,
      selectedAsset.priceUsd,
    );

    const actionInputPayload = {
      action: activeAction,
      userAddress,
      assetSymbol: selectedAsset.symbol,
      assetAddress: selectedAsset.contractId,
      amount: parsedAmount,
      availableBalance: selectedAsset.walletBalance,
      depositedBalance: selectedAsset.depositedBalance,
      borrowedBalance: selectedAsset.borrowedBalance,
      priceUsd: selectedAsset.priceUsd,
      borrowLimitUsd: validationCtx.borrowLimitUsd,
      decimals: selectedAsset.decimals,
    };

    const handleStatus = (step: string, message?: string) => {
      setStatusStep(message || step);
    };

    let result: ActionResponse;

    switch (activeAction) {
      case 'DEPOSIT':
        result = await executeDeposit(actionInputPayload, handleStatus);
        break;
      case 'WITHDRAW':
        result = await executeWithdraw(actionInputPayload, handleStatus);
        break;
      case 'BORROW':
        result = await executeBorrow(actionInputPayload, handleStatus);
        break;
      case 'REPAY':
        result = await executeRepay(actionInputPayload, handleStatus);
        break;
      default:
        result = {
          success: false,
          error: { title: 'Invalid Action', description: 'Action not supported.' },
        };
    }

    setIsSubmitting(false);

    if (result.success) {
      dashboardStore.confirmOptimisticAction(pendingId, result.txHash);
      onActionSuccess?.();
      handleCloseModal();
    } else {
      const err = result.error || {
        title: 'Action Failed',
        description: 'An error occurred during transaction execution.',
      };
      dashboardStore.rollbackOptimisticAction(pendingId, err);
      setErrorAlert(err);
    }
  };

  return (
    <>
      {/* Top Dashboard Action Tray Buttons */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl backdrop-blur-md shadow-lg">
        <Button
          type="button"
          aria-label="Open Deposit modal"
          onClick={() => handleOpenModal('DEPOSIT')}
          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
        >
          <PlusCircle className="h-4 w-4" />
          Deposit
        </Button>

        <Button
          type="button"
          aria-label="Open Withdraw modal"
          onClick={() => handleOpenModal('WITHDRAW')}
          className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
        >
          <ArrowUpRight className="h-4 w-4" />
          Withdraw
        </Button>

        <Button
          type="button"
          aria-label="Open Borrow modal"
          onClick={() => handleOpenModal('BORROW')}
          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
        >
          <ArrowDownLeft className="h-4 w-4" />
          Borrow
        </Button>

        <Button
          type="button"
          aria-label="Open Repay modal"
          onClick={() => handleOpenModal('REPAY')}
          className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
        >
          <MinusCircle className="h-4 w-4" />
          Repay
        </Button>
      </div>

      {/* Global Rollback / Action Alert Banner */}
      {dashboardStore.alert && (
        <Alert variant="destructive" className="mt-4 border-red-500/30 bg-red-500/10 text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-bold">{dashboardStore.alert.title}</AlertTitle>
          <AlertDescription className="text-xs">
            {dashboardStore.alert.description}
          </AlertDescription>
        </Alert>
      )}

      {/* Radix Action Dialog Modal */}
      <Dialog open={!!activeAction} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md w-full p-6 shadow-2xl rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-slate-100 flex items-center gap-2">
              {activeAction === 'DEPOSIT' && <PlusCircle className="h-5 w-5 text-emerald-400" />}
              {activeAction === 'WITHDRAW' && <ArrowUpRight className="h-5 w-5 text-cyan-400" />}
              {activeAction === 'BORROW' && <ArrowDownLeft className="h-5 w-5 text-amber-400" />}
              {activeAction === 'REPAY' && <MinusCircle className="h-5 w-5 text-purple-400" />}
              {activeAction ? `${activeAction.charAt(0) + activeAction.slice(1).toLowerCase()} Asset` : ''}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Select supported protocol asset and enter transaction amount.
            </DialogDescription>
          </DialogHeader>

          {/* Modal Error Alert */}
          {errorAlert && (
            <Alert variant="destructive" role="alert" className="border-red-500/40 bg-red-500/10 text-red-300">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertTitle className="font-bold">{errorAlert.title}</AlertTitle>
              <AlertDescription className="text-xs">{errorAlert.description}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-2">
            {/* Asset Picker Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor="asset-picker" className="text-xs font-semibold text-slate-400">
                Select Asset
              </label>
              <select
                id="asset-picker"
                value={selectedAssetSymbol}
                disabled={isSubmitting}
                onChange={(e) => setSelectedAssetSymbol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {supportedAssets.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>
                    {asset.symbol} - {asset.name} (${asset.priceUsd.toFixed(2)})
                  </option>
                ))}
              </select>

              <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 pt-1">
                <span>Wallet Balance: {selectedAsset.walletBalance} {selectedAsset.symbol}</span>
                {activeAction === 'WITHDRAW' && (
                  <span>Deposited: {selectedAsset.depositedBalance} {selectedAsset.symbol}</span>
                )}
                {activeAction === 'REPAY' && (
                  <span>Debt: {selectedAsset.borrowedBalance} {selectedAsset.symbol}</span>
                )}
              </div>
            </div>

            {/* Shortcuts (MAX / 50% / HALF) */}
            <div className="flex items-center justify-between gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400">Shortcuts:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyShortcut(0.5)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 rounded transition-colors disabled:opacity-50"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyShortcut(0.5)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 rounded transition-colors disabled:opacity-50"
                >
                  HALF
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyShortcut(1.0)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-xs font-mono font-bold text-indigo-400 rounded border border-indigo-500/30 transition-colors disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* AmountInput with W8 validation */}
            {activeAction && (
              <AmountInput
                action={activeAction}
                context={validationCtx}
                assetSymbol={selectedAsset.symbol}
                value={amountInput}
                onChange={setAmountInput}
                onValidityChange={setValidity}
                disabled={isSubmitting}
              />
            )}

            {/* Health Factor Preview for Borrow & Withdraw */}
            {healthFactorPreview && (
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" /> Health Factor Preview:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">
                      {healthFactorPreview.currentHF === Infinity
                        ? '∞'
                        : healthFactorPreview.currentHF.toFixed(2)}
                    </span>
                    <span>→</span>
                    <Badge
                      variant="outline"
                      className={
                        healthFactorPreview.isRisky
                          ? 'border-red-500/40 bg-red-500/10 text-red-400'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      }
                    >
                      {healthFactorPreview.nextHF === Infinity
                        ? '∞'
                        : healthFactorPreview.nextHF.toFixed(2)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCloseModal}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-slate-200"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSubmitAction}
              disabled={!validity.valid || isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-6 shadow-md disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {statusStep || 'Processing...'}
                </>
              ) : (
                `Confirm ${activeAction || ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useCallback, useRef } from 'react';
import { DashboardData, PortfolioData, ActivityEvent, ActivityActionType } from '../types/dashboard';

export interface AlertState {
  title: string;
  description: string;
}

export interface PendingAction {
  id: string;
  action: ActivityActionType;
  assetSymbol: string;
  amount: number;
  usdValue: number;
  timestamp: string;
  previousPortfolio: PortfolioData;
  previousActivity: ActivityEvent[];
}

export interface UseDashboardStoreResult {
  data: DashboardData | null;
  alert: AlertState | null;
  setInitialData: (data: DashboardData) => void;
  applyOptimisticAction: (
    action: ActivityActionType,
    assetSymbol: string,
    amount: number,
    priceUsd: number,
  ) => string;
  confirmOptimisticAction: (pendingId: string, txHash?: string) => void;
  rollbackOptimisticAction: (pendingId: string, alertError: AlertState) => void;
  clearAlert: () => void;
}

/**
 * State store managing portfolio state, optimistic balance mutations,
 * pending activity rows, confirmation swapping, and rollback handling.
 */
export function useDashboardStore(initialData?: DashboardData | null): UseDashboardStoreResult {
  const [data, setData] = useState<DashboardData | null>(initialData || null);
  const [alert, setAlert] = useState<AlertState | null>(null);

  const pendingActionsRef = useRef<Map<string, PendingAction>>(new Map());

  const setInitialData = useCallback((newData: DashboardData) => {
    setData(newData);
  }, []);

  const clearAlert = useCallback(() => {
    setAlert(null);
  }, []);

  const applyOptimisticAction = useCallback(
    (
      action: ActivityActionType,
      assetSymbol: string,
      amount: number,
      priceUsd: number,
    ): string => {
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const usdValue = amount * priceUsd;
      const timestamp = new Date().toISOString();

      setData((prevData) => {
        if (!prevData) {
          const emptyPortfolio: PortfolioData = {
            totalBalanceUsd: 0,
            healthFactor: Infinity,
            totalDepositedUsd: 0,
            totalBorrowedUsd: 0,
            depositedAssets: [],
            borrowedAssets: [],
            lastUpdated: timestamp,
            hfBreakdown: [],
          };
          prevData = { portfolio: emptyPortfolio, recentActivity: [] };
        }

        // Store snapshot for potential rollback
        const snapshot: PendingAction = {
          id: pendingId,
          action,
          assetSymbol,
          amount,
          usdValue,
          timestamp,
          previousPortfolio: JSON.parse(JSON.stringify(prevData.portfolio)),
          previousActivity: [...prevData.recentActivity],
        };
        pendingActionsRef.current.set(pendingId, snapshot);

        // Mutate portfolio optimistically
        const updatedPortfolio: PortfolioData = JSON.parse(JSON.stringify(prevData.portfolio));
        updatedPortfolio.lastUpdated = timestamp;

        if (action === 'DEPOSIT') {
          updatedPortfolio.totalDepositedUsd += usdValue;
          updatedPortfolio.totalBalanceUsd += usdValue;

          const assetIndex = updatedPortfolio.depositedAssets.findIndex(
            (a) => a.assetSymbol === assetSymbol,
          );
          if (assetIndex >= 0) {
            updatedPortfolio.depositedAssets[assetIndex].balance += amount;
            updatedPortfolio.depositedAssets[assetIndex].usdValue += usdValue;
          } else {
            updatedPortfolio.depositedAssets.push({
              assetSymbol,
              assetName: assetSymbol,
              balance: amount,
              usdValue,
            });
          }
        } else if (action === 'WITHDRAW') {
          updatedPortfolio.totalDepositedUsd = Math.max(0, updatedPortfolio.totalDepositedUsd - usdValue);
          updatedPortfolio.totalBalanceUsd -= usdValue;

          const assetIndex = updatedPortfolio.depositedAssets.findIndex(
            (a) => a.assetSymbol === assetSymbol,
          );
          if (assetIndex >= 0) {
            updatedPortfolio.depositedAssets[assetIndex].balance = Math.max(
              0,
              updatedPortfolio.depositedAssets[assetIndex].balance - amount,
            );
            updatedPortfolio.depositedAssets[assetIndex].usdValue = Math.max(
              0,
              updatedPortfolio.depositedAssets[assetIndex].usdValue - usdValue,
            );
          }
        } else if (action === 'BORROW') {
          updatedPortfolio.totalBorrowedUsd += usdValue;
          updatedPortfolio.totalBalanceUsd -= usdValue;

          const assetIndex = updatedPortfolio.borrowedAssets.findIndex(
            (a) => a.assetSymbol === assetSymbol,
          );
          if (assetIndex >= 0) {
            updatedPortfolio.borrowedAssets[assetIndex].balance += amount;
            updatedPortfolio.borrowedAssets[assetIndex].usdValue += usdValue;
          } else {
            updatedPortfolio.borrowedAssets.push({
              assetSymbol,
              assetName: assetSymbol,
              balance: amount,
              usdValue,
            });
          }
        } else if (action === 'REPAY') {
          updatedPortfolio.totalBorrowedUsd = Math.max(0, updatedPortfolio.totalBorrowedUsd - usdValue);
          updatedPortfolio.totalBalanceUsd += usdValue;

          const assetIndex = updatedPortfolio.borrowedAssets.findIndex(
            (a) => a.assetSymbol === assetSymbol,
          );
          if (assetIndex >= 0) {
            updatedPortfolio.borrowedAssets[assetIndex].balance = Math.max(
              0,
              updatedPortfolio.borrowedAssets[assetIndex].balance - amount,
            );
            updatedPortfolio.borrowedAssets[assetIndex].usdValue = Math.max(
              0,
              updatedPortfolio.borrowedAssets[assetIndex].usdValue - usdValue,
            );
          }
        }

        // Recompute health factor
        updatedPortfolio.healthFactor =
          updatedPortfolio.totalBorrowedUsd === 0
            ? Infinity
            : Math.min((updatedPortfolio.totalDepositedUsd * 0.8) / updatedPortfolio.totalBorrowedUsd, 99.99);

        // Add PENDING activity row at top
        const pendingRow: ActivityEvent = {
          id: pendingId,
          action,
          assetSymbol,
          amount,
          usdValue,
          timestamp,
          status: 'PENDING',
        };

        const updatedActivity = [pendingRow, ...prevData.recentActivity];

        return {
          portfolio: updatedPortfolio,
          recentActivity: updatedActivity,
        };
      });

      return pendingId;
    },
    [],
  );

  const confirmOptimisticAction = useCallback(
    (pendingId: string, txHash?: string) => {
      pendingActionsRef.current.delete(pendingId);

      setData((prevData) => {
        if (!prevData) return prevData;

        const updatedActivity = prevData.recentActivity.map((activity) => {
          if (activity.id === pendingId) {
            return {
              ...activity,
              status: 'COMPLETED' as const,
              txHash,
            };
          }
          return activity;
        });

        return {
          ...prevData,
          recentActivity: updatedActivity,
        };
      });
    },
    [],
  );

  const rollbackOptimisticAction = useCallback(
    (pendingId: string, alertError: AlertState) => {
      const snapshot = pendingActionsRef.current.get(pendingId);
      pendingActionsRef.current.delete(pendingId);

      if (snapshot) {
        setData({
          portfolio: snapshot.previousPortfolio,
          recentActivity: snapshot.previousActivity,
        });
      }

      setAlert(alertError);
    },
    [],
  );

  return {
    data,
    alert,
    setInitialData,
    applyOptimisticAction,
    confirmOptimisticAction,
    rollbackOptimisticAction,
    clearAlert,
  };
}

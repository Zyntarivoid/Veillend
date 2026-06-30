'use client'

import * as React from 'react';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SyncStatus } from '@/lib/hooks/usePositionSync';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncedAt: number | null;
  onRefresh?: () => void;
}

/**
 * Compact visual indicator of the live-sync state. Gives the user an at-a-glance
 * sense of whether the numbers on screen are fresh, stale, or failing to update.
 */
export function SyncStatusBadge({ status, lastSyncedAt, onRefresh }: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider',
          config.className,
        )}
      >
        <Icon className={cn('h-3 w-3', status === 'loading' && 'animate-spin')} />
        {config.label}
      </span>

      {lastSyncedAt && (status === 'live' || status === 'stale') && (
        <span className="text-[11px] font-mono text-slate-500">
          {formatRelative(lastSyncedAt)}
        </span>
      )}

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh positions"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  idle: {
    label: 'Idle',
    icon: CircleDashed,
    className: 'border-slate-800 bg-slate-900/60 text-slate-500',
  },
  loading: {
    label: 'Syncing',
    icon: RefreshCw,
    className: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400',
  },
  live: {
    label: 'Live',
    icon: Wifi,
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  },
  stale: {
    label: 'Stale',
    icon: AlertTriangle,
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  },
  empty: {
    label: 'No positions',
    icon: CircleDashed,
    className: 'border-slate-800 bg-slate-900/60 text-slate-500',
  },
  error: {
    label: 'Offline',
    icon: WifiOff,
    className: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  },
};

function formatRelative(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

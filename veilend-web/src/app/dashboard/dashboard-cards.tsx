import { cache, Suspense } from 'react';
import { ActionTray } from '@/components/ActionTray';
import { Flex, Grid } from '@/components/Layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchDashboardData } from '@/lib/api/dashboard';
import { isRetryableApiError } from '@/lib/api/validated-fetch';
import type { ActivityEvent, AssetBalance, DashboardData } from '@/lib/types/dashboard';
import { ValidationError } from '@/lib/validation/api-schemas';
import { HfBreakdownTooltip } from './hf-breakdown-tooltip';

type DashboardResult =
  | { data: DashboardData; error: null }
  | { data: null; error: Error };

const getDashboardResult = cache(async (walletAddress: string): Promise<DashboardResult> => {
  try {
    return { data: await fetchDashboardData(walletAddress), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to load dashboard data'),
    };
  }
});

export function preloadDashboardData(walletAddress: string): void {
  void getDashboardResult(walletAddress);
}

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
};

function CardError({
  title,
  error,
  numeric = false,
}: {
  title: string;
  error: Error;
  numeric?: boolean;
}) {
  const validationFailed = error instanceof ValidationError;
  const message = validationFailed
    ? `Data validation warning: ${error.message}`
    : error.message;

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {numeric && <div className="mb-3 text-3xl font-bold text-text-secondary">—</div>}
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        {isRetryableApiError(error) && (
          <Button asChild variant="outline" className="mt-3">
            <a href="/dashboard">Try Again</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function SummaryCardSkeleton({ titleWidth = 'w-32' }: { titleWidth?: string }) {
  return (
    <Card aria-busy="true" aria-label="Loading portfolio summary">
      <CardHeader>
        <Skeleton className={`h-5 ${titleWidth}`} />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-40" />
      </CardContent>
    </Card>
  );
}

export async function TotalBalanceCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Total Balance" error={result.error} numeric />;

  const { totalBalanceUsd } = result.data.portfolio;
  return (
    <Card>
      <CardHeader><CardTitle>Total Balance</CardTitle></CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${totalBalanceUsd >= 0 ? 'text-text' : 'text-error'}`}>
          {formatUsd(totalBalanceUsd)}
        </div>
      </CardContent>
    </Card>
  );
}

export async function TotalDepositedCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Total Deposited" error={result.error} numeric />;

  return (
    <Card>
      <CardHeader><CardTitle>Total Deposited</CardTitle></CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-success">
          {formatUsd(result.data.portfolio.totalDepositedUsd)}
        </div>
      </CardContent>
    </Card>
  );
}

export async function TotalBorrowedCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Total Borrowed" error={result.error} numeric />;

  const { healthFactor, totalBorrowedUsd, hfBreakdown, hfWarning } = result.data.portfolio;
  return (
    <Card>
      <CardHeader>
        <Flex justify="between" align="center">
          <CardTitle>Total Borrowed</CardTitle>
          <HfBreakdownTooltip
            healthFactor={healthFactor}
            hfBreakdown={hfBreakdown}
            hfWarning={hfWarning}
          />
        </Flex>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-error">{formatUsd(totalBorrowedUsd)}</div>
      </CardContent>
    </Card>
  );
}

export function AssetCardSkeleton({ title }: { title: string }) {
  return (
    <Card aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <Flex direction="col" gap="md">
          {[1, 2, 3].map((item) => (
            <Flex key={item} justify="between" align="center" className="py-2">
              <Flex gap="md" align="center">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-16" /></div>
              </Flex>
              <Skeleton className="h-5 w-20" />
            </Flex>
          ))}
        </Flex>
      </CardContent>
    </Card>
  );
}

function AssetRowSkeleton({ borrowed = false }: { borrowed?: boolean }) {
  return (
    <Flex justify="between" align="center" className="py-2">
      <Flex gap="md" align="center">
        <Skeleton className={`h-10 w-10 rounded-full ${borrowed ? 'bg-error/10' : 'bg-primary/10'}`} />
        <div className="space-y-1">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </Flex>
      <Skeleton className="h-5 w-20" />
    </Flex>
  );
}

async function AssetRow({
  walletAddress,
  asset,
  borrowed = false,
}: {
  walletAddress: string;
  asset: AssetBalance;
  borrowed?: boolean;
}) {
  // Await the shared cached payload so this row streams in independently of
  // its siblings. React cache deduplicates the underlying request.
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return null;

  return (
    <Flex justify="between" align="center" className="py-2 border-b border-border last:border-0">
      <Flex gap="md" align="center">
        {/* Asset logo or initial badge */}
        {asset.logoUrl ? (
          <img
            src={asset.logoUrl}
            alt={asset.assetSymbol}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${borrowed ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
            {asset.assetSymbol.charAt(0)}
          </div>
        )}
        <div>
          <div className="font-semibold text-text">{asset.assetName}</div>
          <div
            className="text-sm text-text-secondary"
            title={asset.decimals !== undefined ? `${asset.assetSymbol} (${asset.decimals} decimals)` : undefined}
          >
            {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.assetSymbol}
            {asset.decimals !== undefined && (
              <span className="ml-1 text-xs opacity-50">({asset.decimals})</span>
            )}
          </div>
        </div>
      </Flex>
      <div className="font-semibold text-text">{formatUsd(asset.usdValue)}</div>
    </Flex>
  );
}

function AssetRows({
  walletAddress,
  assets,
  emptyMessage,
  borrowed = false,
}: {
  walletAddress: string;
  assets: AssetBalance[];
  emptyMessage: string;
  borrowed?: boolean;
}) {
  if (assets.length === 0) return <p className="text-text-secondary">{emptyMessage}</p>;

  return (
    <Flex direction="col" gap="md">
      {assets.map((asset) => (
        <Suspense key={asset.assetSymbol} fallback={<AssetRowSkeleton borrowed={borrowed} />}>
          <AssetRow walletAddress={walletAddress} asset={asset} borrowed={borrowed} />
        </Suspense>
      ))}
    </Flex>
  );
}

export async function DepositedAssetsCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Deposited Assets" error={result.error} />;
  return (
    <Card>
      <CardHeader><CardTitle>Deposited Assets</CardTitle></CardHeader>
      <CardContent>
        <AssetRows
          walletAddress={walletAddress}
          assets={result.data.portfolio.depositedAssets}
          emptyMessage="No deposited assets found."
        />
      </CardContent>
    </Card>
  );
}

export async function BorrowedAssetsCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Borrowed Assets" error={result.error} />;
  return (
    <Card>
      <CardHeader><CardTitle>Borrowed Assets</CardTitle></CardHeader>
      <CardContent>
        <AssetRows
          walletAddress={walletAddress}
          assets={result.data.portfolio.borrowedAssets}
          emptyMessage="No borrowed assets."
          borrowed
        />
      </CardContent>
    </Card>
  );
}

const actionBadgeClassName = (action: string): string | undefined => ({
  DEPOSIT: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  BORROW: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  REPAY: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
  WITHDRAW: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
})[action];

export function RecentActivitySkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading recent activity">
      <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
      <CardContent>
        <Flex direction="col" gap="md">
          {[1, 2, 3, 4, 5].map((item) => (
            <Flex key={item} justify="between" align="center" className="py-3">
              <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-32" /></div>
              <div className="space-y-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-16" /></div>
            </Flex>
          ))}
        </Flex>
      </CardContent>
    </Card>
  );
}

function RecentActivityRowSkeleton() {
  return (
    <Flex justify="between" align="center" className="py-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-5 w-20 ml-auto" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
    </Flex>
  );
}

async function RecentActivityRow({
  walletAddress,
  item,
}: {
  walletAddress: string;
  item: ActivityEvent;
}) {
  // Await the shared cached payload so this row streams in independently of
  // its siblings. React cache deduplicates the underlying request.
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return null;

  return (
    <Flex justify="between" align="center" className="py-3 border-b border-border last:border-0">
      <div>
        <Flex align="center" gap="sm" className="mb-1">
          <Badge variant="outline" className={actionBadgeClassName(item.action)}>{item.action}</Badge>
          <span className="font-semibold text-text">
            {item.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {item.assetSymbol}
          </span>
        </Flex>
        <div className="text-sm text-text-secondary">{new Date(item.timestamp).toLocaleString()}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-text">{formatUsd(item.usdValue)}</div>
        <div className="text-sm text-text-secondary capitalize">{item.status.toLowerCase()}</div>
      </div>
    </Flex>
  );
}

export async function RecentActivityCard({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  if (!result.data) return <CardError title="Recent Activity" error={result.error} />;
  const activity = result.data.recentActivity;

  return (
    <Card>
      <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
      <CardContent>
        {activity.length === 0 ? <p className="text-text-secondary">No recent activity found.</p> : (
          <Flex direction="col" gap="md">
            {activity.slice(0, 20).map((item) => (
              <Suspense key={item.id} fallback={<RecentActivityRowSkeleton />}>
                <RecentActivityRow walletAddress={walletAddress} item={item} />
              </Suspense>
            ))}
          </Flex>
        )}
      </CardContent>
    </Card>
  );
}

export async function DashboardActionTray({ walletAddress }: { walletAddress: string }) {
  const result = await getDashboardResult(walletAddress);
  return <ActionTray userAddress={walletAddress} portfolio={result.data?.portfolio} />;
}

export function DashboardGridSkeleton() {
  return <Grid columns={3} gap="lg"><SummaryCardSkeleton /><SummaryCardSkeleton /><SummaryCardSkeleton /></Grid>;
}

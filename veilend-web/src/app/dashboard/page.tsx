import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchDashboardData } from '@/lib/api/dashboard';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Helper to get wallet address from session/cookie
async function getWalletAddress(): Promise<string | null> {
  // In a production app, this would get the address from a secure session
  // For now, we'll check for a wallet address in the headers
  const headersList = await headers();
  const walletAddress = headersList.get('x-wallet-address');
  
  if (walletAddress && walletAddress.startsWith('G')) {
    return walletAddress;
  }
  
  return null;
}

// Helper functions moved outside component
const getActionBadgeClassName = (action: string): string | undefined => {
  switch (action) {
    case 'DEPOSIT':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
    case 'BORROW':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
    case 'REPAY':
      return 'border-purple-500/20 bg-purple-500/10 text-purple-400';
    case 'WITHDRAW':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400';
    default:
      return undefined;
  }
};

const formatUsd = (val: number): string =>
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

const formatHealthFactor = (factor: number): string => {
  if (factor === Infinity) return '∞';
  return factor.toFixed(2);
};

export default async function DashboardPage() {
  const walletAddress = await getWalletAddress();

  // Redirect to home if no wallet is connected
  if (!walletAddress) {
    redirect('/');
  }

  let data;
  let error: string | null = null;

  try {
    data = await fetchDashboardData(walletAddress);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load dashboard data';
    data = null;
  }

  const { portfolio, recentActivity } = data || {
    portfolio: {
      totalBalanceUsd: 0,
      healthFactor: Infinity,
      totalDepositedUsd: 0,
      totalBorrowedUsd: 0,
      depositedAssets: [],
      borrowedAssets: [],
      lastUpdated: new Date().toISOString(),
    },
    recentActivity: [],
  };

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Container className="pb-16 pt-20">
          <Alert variant="destructive">
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Live Dashboard</h1>
              <p className="text-lg text-text-secondary">
                Overview of your Stellar network portfolio and recent activity.
                <span className="ml-2 text-sm text-text-muted">
                  Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)}
                </span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                Last updated: {new Date(portfolio.lastUpdated).toLocaleString()}
              </p>
            </div>
          </Flex>
        </Section>

        {/* Portfolio Section */}
        <Section>
          <Grid columns={3} gap="lg">
            <Card>
              <CardHeader>
                <CardTitle>Total Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${portfolio.totalBalanceUsd >= 0 ? 'text-text' : 'text-error'}`}>
                  {formatUsd(portfolio.totalBalanceUsd)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Deposited</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-success">
                  {formatUsd(portfolio.totalDepositedUsd)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Flex justify="between" align="center">
                  <CardTitle>Total Borrowed</CardTitle>
                  <Badge
                    variant={portfolio.healthFactor < 1.1 && portfolio.healthFactor !== Infinity ? 'destructive' : 'secondary'}
                    className={portfolio.healthFactor >= 1.1 || portfolio.healthFactor === Infinity 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : undefined}
                  >
                    Health: {formatHealthFactor(portfolio.healthFactor)}
                  </Badge>
                </Flex>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-error">
                  {formatUsd(portfolio.totalBorrowedUsd)}
                </div>
              </CardContent>
            </Card>
          </Grid>
        </Section>

        {/* Asset Breakdown */}
        <Section>
          <Grid columns={2} gap="lg">
            <Card>
              <CardHeader>
                <CardTitle>Deposited Assets</CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio.depositedAssets.length === 0 ? (
                  <p className="text-text-secondary">No deposited assets found.</p>
                ) : (
                  <Flex direction="col" gap="md">
                    {portfolio.depositedAssets.map((asset) => (
                      <Flex
                        key={asset.assetSymbol}
                        justify="between"
                        align="center"
                        className="py-2 border-b border-border last:border-0"
                      >
                        <Flex gap="md" align="center">
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary font-bold">
                            {asset.assetSymbol.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-text">{asset.assetName}</div>
                            <div className="text-sm text-text-secondary">
                              {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.assetSymbol}
                            </div>
                          </div>
                        </Flex>
                        <div className="font-semibold text-text">{formatUsd(asset.usdValue)}</div>
                      </Flex>
                    ))}
                  </Flex>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Borrowed Assets</CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio.borrowedAssets.length === 0 ? (
                  <p className="text-text-secondary">No borrowed assets.</p>
                ) : (
                  <Flex direction="col" gap="md">
                    {portfolio.borrowedAssets.map((asset) => (
                      <Flex
                        key={asset.assetSymbol}
                        justify="between"
                        align="center"
                        className="py-2 border-b border-border last:border-0"
                      >
                        <Flex gap="md" align="center">
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-error/10 text-error font-bold">
                            {asset.assetSymbol.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-text">{asset.assetName}</div>
                            <div className="text-sm text-text-secondary">
                              {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.assetSymbol}
                            </div>
                          </div>
                        </Flex>
                        <div className="font-semibold text-text">{formatUsd(asset.usdValue)}</div>
                      </Flex>
                    ))}
                  </Flex>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Section>

        {/* Recent Activity */}
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-text-secondary">No recent activity found.</p>
              ) : (
                <Flex direction="col" gap="md">
                  {recentActivity.slice(0, 20).map((activity) => (
                    <Flex
                      key={activity.id}
                      justify="between"
                      align="center"
                      className="py-3 border-b border-border last:border-0"
                    >
                      <Flex gap="md" align="center">
                        <div>
                          <Flex align="center" gap="sm" className="mb-1">
                            <Badge variant="outline" className={getActionBadgeClassName(activity.action)}>
                              {activity.action}
                            </Badge>
                            <span className="font-semibold text-text">
                              {activity.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {activity.assetSymbol}
                            </span>
                          </Flex>
                          <div className="text-sm text-text-secondary">
                            {new Date(activity.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </Flex>
                      <div className="text-right">
                        <div className="font-semibold text-text">
                          {formatUsd(activity.usdValue)}
                        </div>
                        <div className="text-sm text-text-secondary capitalize">
                          {activity.status.toLowerCase()}
                        </div>
                      </div>
                    </Flex>
                  ))}
                </Flex>
              )}
            </CardContent>
          </Card>
        </Section>
      </Container>
    </div>
  );
}
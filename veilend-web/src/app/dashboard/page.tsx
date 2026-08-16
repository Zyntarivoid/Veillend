import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AmountDisplay } from '@/components/AmountDisplay';
import { DashboardPortfolioCards } from '@/components/DashboardPortfolioCards';
import { DashboardRetryButton } from '@/components/DashboardRetryButton';
import { fetchDashboardData } from '@/lib/api/dashboard';
import { HttpError, NetworkError, ValidationError } from '@/lib/api/errors';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getWalletAddress(): Promise<string | null> {
  const headersList = await headers();
  const walletAddress = headersList.get('x-wallet-address');

  if (walletAddress && walletAddress.startsWith('G')) {
    return walletAddress;
  }

  return null;
}

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

export default async function DashboardPage() {
  const walletAddress = await getWalletAddress();

  if (!walletAddress) {
    redirect('/');
  }

  let data = null;
  let error: unknown = null;

  try {
    data = await fetchDashboardData(walletAddress);
  } catch (err) {
    error = err;
    data = null;
  }

  const isValidationError = error instanceof ValidationError;
  const isNetworkError =
    error instanceof NetworkError || (error instanceof HttpError && error.retryable);

  if (isNetworkError) {
    return (
      <div className="min-h-screen bg-background">
        <Container className="pb-16 pt-20">
          <Alert variant="destructive">
            <AlertTitle>Network Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load dashboard data'}
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <DashboardRetryButton />
          </div>
        </Container>
      </div>
    );
  }

  const portfolio = data?.portfolio ?? null;
  const recentActivity = data?.recentActivity ?? [];

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
              {portfolio ? (
                <p className="text-xs text-text-muted mt-1">
                  Last updated: {new Date(portfolio.lastUpdated).toLocaleString()}
                </p>
              ) : null}
            </div>
            {isValidationError ? (
              <Alert variant="destructive">
                <AlertTitle>Invalid dashboard data</AlertTitle>
                <AlertDescription>
                  Some amounts could not be validated and are shown as placeholders.
                </AlertDescription>
              </Alert>
            ) : null}
          </Flex>
        </Section>

        <Section>
          <DashboardPortfolioCards
            portfolio={portfolio}
            amountWarning={error instanceof ValidationError ? error.message : undefined}
          />
        </Section>

        <Section>
          <Grid columns={2} gap="lg">
            <Card>
              <CardHeader>
                <CardTitle>Deposited Assets</CardTitle>
              </CardHeader>
              <CardContent>
                {!portfolio || portfolio.depositedAssets.length === 0 ? (
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
                              <AmountDisplay value={asset.balance} format="plain" /> {asset.assetSymbol}
                            </div>
                          </div>
                        </Flex>
                        <div className="font-semibold text-text">
                          <AmountDisplay value={asset.usdValue} />
                        </div>
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
                {!portfolio || portfolio.borrowedAssets.length === 0 ? (
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
                              <AmountDisplay value={asset.balance} format="plain" /> {asset.assetSymbol}
                            </div>
                          </div>
                        </Flex>
                        <div className="font-semibold text-text">
                          <AmountDisplay value={asset.usdValue} />
                        </div>
                      </Flex>
                    ))}
                  </Flex>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Section>

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
                              <AmountDisplay value={activity.amount} format="plain" /> {activity.assetSymbol}
                            </span>
                          </Flex>
                          <div className="text-sm text-text-secondary">
                            {new Date(activity.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </Flex>
                      <div className="text-right">
                        <div className="font-semibold text-text">
                          <AmountDisplay value={activity.usdValue} />
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

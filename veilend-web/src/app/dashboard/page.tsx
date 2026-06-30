import type { Metadata } from 'next';
import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { fetchDashboardData } from '@/lib/api/dashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Monitor your VeilLend portfolio, shielded assets, collateral ratios, and Soroban smart credit allocations on Stellar.',
  openGraph: {
    title: 'Dashboard | VeilLend',
    description: 'Monitor your VeilLend portfolio, shielded assets, and collateral ratios on Stellar.',
  },
  twitter: {
    title: 'Dashboard | VeilLend',
    description: 'Monitor your VeilLend portfolio, shielded assets, and collateral ratios on Stellar.',
  },
};

// Define the BadgeVariant type matching the Badge component
type BadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "error";

export default async function DashboardPage() {
  const data = await fetchDashboardData();
  const { portfolio, recentActivity } = data;

  const getActionBadgeColor = (action: string): BadgeVariant => {
    switch (action) {
      case 'DEPOSIT':
        return 'success';
      case 'BORROW':
        return 'warning';
      case 'REPAY':
        return 'primary';
      case 'WITHDRAW':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const formatUsd = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Live Dashboard</h1>
              <p className="text-lg text-text-secondary">
                Overview of your Stellar network portfolio and recent activity.
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
                <div className="text-3xl font-bold text-text">
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
                  <Badge variant={portfolio.healthFactor < 1.1 ? 'error' : 'success'}>
                    Health: {portfolio.healthFactor.toFixed(2)}
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
                  <p className="text-text-secondary">No deposited assets.</p>
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
                              {asset.balance.toLocaleString()} {asset.assetSymbol}
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
                              {asset.balance.toLocaleString()} {asset.assetSymbol}
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
                  {recentActivity.map((activity) => (
                    <Flex
                      key={activity.id}
                      justify="between"
                      align="center"
                      className="py-3 border-b border-border last:border-0"
                    >
                      <Flex gap="md" align="center">
                        <div>
                          <Flex align="center" gap="sm" className="mb-1">
                            <Badge variant={getActionBadgeColor(activity.action)}>
                              {activity.action}
                            </Badge>
                            <span className="font-semibold text-text">
                              {activity.amount.toLocaleString()} {activity.assetSymbol}
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
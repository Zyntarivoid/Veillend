import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flex, Grid } from '@/components/Layout';
import { AmountDisplay, UNAVAILABLE_AMOUNT_WARNING } from '@/components/AmountDisplay';
import { toSafeNumber } from '@/lib/validation/coerce';
import type { PortfolioData } from '@/lib/types/dashboard';

type DashboardPortfolioCardsProps = {
  portfolio: PortfolioData | null;
  amountWarning?: string;
};

function formatHealthFactor(factor: number | null): string {
  const safe = toSafeNumber(factor);
  if (safe === null) {
    return '—';
  }
  if (factor === Infinity) {
    return '∞';
  }
  return safe.toFixed(2);
}

export function DashboardPortfolioCards({
  portfolio,
  amountWarning = UNAVAILABLE_AMOUNT_WARNING,
}: DashboardPortfolioCardsProps) {
  const totalBalanceUsd = portfolio ? toSafeNumber(portfolio.totalBalanceUsd) : null;
  const totalDepositedUsd = portfolio ? toSafeNumber(portfolio.totalDepositedUsd) : null;
  const totalBorrowedUsd = portfolio ? toSafeNumber(portfolio.totalBorrowedUsd) : null;
  const healthFactor = portfolio ? portfolio.healthFactor : null;
  const healthSafe = toSafeNumber(healthFactor);

  return (
    <Grid columns={3} gap="lg">
      <Card>
        <CardHeader>
          <CardTitle>Total Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-3xl font-bold ${
              totalBalanceUsd !== null && totalBalanceUsd < 0 ? 'text-error' : 'text-text'
            }`}
          >
            <AmountDisplay value={totalBalanceUsd} warning={amountWarning} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Total Deposited</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-success">
            <AmountDisplay value={totalDepositedUsd} warning={amountWarning} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Flex justify="between" align="center">
            <CardTitle>Total Borrowed</CardTitle>
            <Badge
              variant={
                healthSafe !== null && healthSafe < 1.1 && healthFactor !== Infinity
                  ? 'destructive'
                  : 'secondary'
              }
              className={
                healthSafe === null || healthSafe >= 1.1 || healthFactor === Infinity
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : undefined
              }
            >
              Health: {formatHealthFactor(healthFactor)}
            </Badge>
          </Flex>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-error">
            <AmountDisplay value={totalBorrowedUsd} warning={amountWarning} />
          </div>
        </CardContent>
      </Card>
    </Grid>
  );
}

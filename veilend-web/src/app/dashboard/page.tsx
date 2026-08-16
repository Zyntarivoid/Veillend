import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Container, Flex, Grid, Section } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { getAbsoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import {
  AssetCardSkeleton,
  BorrowedAssetsCard,
  DashboardActionTray,
  DepositedAssetsCard,
  preloadDashboardData,
  RecentActivityCard,
  RecentActivitySkeleton,
  SummaryCardSkeleton,
  TotalBalanceCard,
  TotalBorrowedCard,
  TotalDepositedCard,
} from './dashboard-cards';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const title = 'Portfolio Dashboard';
const description = 'Monitor private Stellar lending positions, deposits, borrowing, and recent VeilLend activity.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/dashboard' },
  openGraph: {
    type: 'website',
    title: `${title} | ${SITE_NAME}`,
    description,
    url: '/dashboard',
    siteName: SITE_NAME,
    images: [{ url: '/favicon.ico', alt: `${SITE_NAME} logo` }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@VeilLend',
    title: `${title} | ${SITE_NAME}`,
    description,
    images: ['/favicon.ico'],
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: `${SITE_NAME} Dashboard`,
  description: SITE_DESCRIPTION,
  url: getAbsoluteUrl('/dashboard'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires JavaScript and a modern web browser',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

async function getWalletAddress(): Promise<string | null> {
  const session = (await cookies()).get('veillend_session')?.value;
  if (!session) return null;

  try {
    const parts = session.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
      walletAddress?: string;
      sub?: string;
    };
    const address = payload.walletAddress || payload.sub;
    return address?.startsWith('G') ? address : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const walletAddress = await getWalletAddress();
  if (!walletAddress) redirect('/');

  // Start the shared request before rendering so every card boundary can stream
  // independently while React cache deduplicates the backend work.
  preloadDashboardData(walletAddress);

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
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
            </div>
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <DashboardActionTray walletAddress={walletAddress} />
            </Suspense>
          </Flex>
        </Section>

        <Section>
          <Grid columns={3} gap="lg">
            <Suspense fallback={<SummaryCardSkeleton />}>
              <TotalBalanceCard walletAddress={walletAddress} />
            </Suspense>
            <Suspense fallback={<SummaryCardSkeleton titleWidth="w-36" />}>
              <TotalDepositedCard walletAddress={walletAddress} />
            </Suspense>
            <Suspense fallback={<SummaryCardSkeleton titleWidth="w-36" />}>
              <TotalBorrowedCard walletAddress={walletAddress} />
            </Suspense>
          </Grid>
        </Section>

        <Section>
          <Grid columns={2} gap="lg">
            <Suspense fallback={<AssetCardSkeleton title="Deposited Assets" />}>
              <DepositedAssetsCard walletAddress={walletAddress} />
            </Suspense>
            <Suspense fallback={<AssetCardSkeleton title="Borrowed Assets" />}>
              <BorrowedAssetsCard walletAddress={walletAddress} />
            </Suspense>
          </Grid>
        </Section>

        <Section>
          <Suspense fallback={<RecentActivitySkeleton />}>
            <RecentActivityCard walletAddress={walletAddress} />
          </Suspense>
        </Section>
      </Container>
    </main>
  );
}

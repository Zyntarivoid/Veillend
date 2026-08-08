import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'VeilLend portfolio dashboard — positions, markets, and wallet status on Stellar testnet.',
  openGraph: {
    title: 'Dashboard | VeilLend',
    description:
      'View lending positions and campaign activity in the VeilLend dashboard.',
  },
  twitter: {
    title: 'Dashboard | VeilLend',
    description:
      'View lending positions and campaign activity in the VeilLend dashboard.',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

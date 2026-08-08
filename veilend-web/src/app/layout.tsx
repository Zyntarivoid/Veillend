import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";
import { WalletProvider } from '@/context/WalletContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://veillend.xyz';

const siteTitle = 'VeilLend | Privacy-first lending on Stellar';
const siteDescription =
  'Privacy-first contributor campaign for building VeilLend on Stellar — transparent markets, wallet connect, and GrantFox OSS development.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | VeilLend',
  },
  description: siteDescription,
  applicationName: 'VeilLend',
  keywords: [
    'VeilLend',
    'Stellar',
    'Soroban',
    'DeFi',
    'privacy',
    'lending',
    'GrantFox',
  ],
  authors: [{ name: 'VeilLend contributors' }],
  creator: 'VeilLend',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'VeilLend',
    title: siteTitle,
    description: siteDescription,
    // Image provided by app/opengraph-image.tsx (Next.js file convention)
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    // Image provided by app/twitter-image.tsx
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: '/favicon.ico' }],
    apple: [{ url: '/favicon.ico' }],
  },
  alternates: {
    canonical: '/',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Avoid layout shift for mobile wallets / OS UI
  colorScheme: 'dark light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://veillend.org';
const siteName = 'VeilLend';

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'VeilLend | GrantFox Campaign',
    template: '%s | VeilLend',
  },
  description:
    'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics.',
  applicationName: siteName,
  generator: 'Next.js',
  keywords: ['VeilLend', 'Stellar', 'Soroban', 'DeFi', 'privacy', 'zero-knowledge', 'lending', 'blockchain'],
  referrer: 'origin-when-cross-origin',
  authors: [{ name: 'VeilLend Protocol Ecosystem' }],
  creator: 'VeilLend Protocol Ecosystem',
  publisher: 'VeilLend Protocol Ecosystem',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
    other: [
      { rel: 'mask-icon', url: '/favicon.svg', color: '#030712' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName,
    title: 'VeilLend | GrantFox Campaign',
    description:
      'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics.',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@veillend',
    creator: '@veillend',
    title: 'VeilLend | GrantFox Campaign',
    description:
      'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics.',
  },
  category: 'technology',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-600 focus:text-white focus:rounded-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <WalletProvider>
          <div id="main-content" className="flex-1 flex flex-col">
            {children}
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
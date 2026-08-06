import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  metadataBase: new URL('https://veillend.vercel.app'),
  title: {
    default: 'VeilLend | GrantFox Campaign',
    template: '%s | VeilLend',
  },
  description:
    'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics. Borrow, lend, and deploy capital with absolute balance protection.',
  keywords: [
    'VeilLend',
    'Stellar',
    'Soroban',
    'DeFi',
    'private lending',
    'zero-knowledge',
    'blockchain',
    'anonymous analytics',
    'GrantFox',
    'FWC26',
  ],
  authors: [{ name: 'VeilLend Protocol' }],
  creator: 'VeilLend Protocol',
  publisher: 'VeilLend Protocol',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'VeilLend',
    title: 'VeilLend | GrantFox Campaign',
    description:
      'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics. Borrow, lend, and deploy capital with absolute balance protection.',
    url: 'https://veillend.vercel.app',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@veillend',
    creator: '@veillend',
    title: 'VeilLend | GrantFox Campaign',
    description:
      'Privacy-first contributor campaign for building VeilLend on Stellar. Borrow, lend, and deploy capital with absolute balance protection.',
  },
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
  category: 'finance',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport = {
  width: 'device-width' as const,
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
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
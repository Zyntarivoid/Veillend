import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VeilLend',
    short_name: 'VeilLend',
    description:
      'Privacy-first contributor campaign for building VeilLend on Stellar with anonymous first-party analytics.',
    start_url: '/',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#030712',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
    categories: ['finance', 'cryptocurrency', 'defi'],
  };
}
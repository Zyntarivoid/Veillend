import type { MetadataRoute } from 'next';
import { getAbsoluteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getAbsoluteUrl('/'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: getAbsoluteUrl('/dashboard'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}

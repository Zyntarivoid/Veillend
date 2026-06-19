'use client';

import { useEffect } from 'react';
import { trackCampaignEvent } from '@/lib/campaignAnalytics';

export function CampaignTracker() {
  useEffect(() => {
    trackCampaignEvent('campaign_page_visit', {
      referrer: document.referrer || undefined,
    });
  }, []);

  return null;
}

'use client';

import { useEffect, useState } from 'react';
import {
  trackCampaignEvent,
  processedEventIds,
  track,
  generateUUID,
} from '@/lib/campaignAnalytics';

export { processedEventIds, track };

export function CampaignTracker() {
  const [eventId] = useState(() => generateUUID());

  useEffect(() => {
    trackCampaignEvent(
      'campaign_page_visit',
      {
        referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      },
      eventId
    );
  }, [eventId]);

  return null;
}



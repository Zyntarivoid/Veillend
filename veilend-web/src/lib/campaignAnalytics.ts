export type CampaignEventName =
  | 'campaign_page_visit'
  | 'campaign_cta_click'
  | 'campaign_contributor_interest';

export type CampaignEventPayload = {
  path?: string;
  referrer?: string;
  source?: string;
  ctaId?: string;
  ctaLabel?: string;
  targetUrl?: string;
  interestArea?: string;
};

export type CampaignEvent = {
  event: CampaignEventName;
  campaign: 'grantfox-oss-stellar';
  timestamp: string;
  payload: CampaignEventPayload;
};

const ANALYTICS_ENDPOINT = '/api/campaign-events';

export function trackCampaignEvent(event: CampaignEventName, payload: CampaignEventPayload = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  const body: CampaignEvent = {
    event,
    campaign: 'grantfox-oss-stellar',
    timestamp: new Date().toISOString(),
    payload: {
      path: window.location.pathname,
      source: new URLSearchParams(window.location.search).get('utm_source') ?? undefined,
      ...payload,
    },
  };

  const serializedBody = JSON.stringify(body);

  if (navigator.sendBeacon) {
    const blob = new Blob([serializedBody], { type: 'application/json' });
    navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
    return;
  }

  fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: serializedBody,
    keepalive: true,
  }).catch(() => undefined);
}

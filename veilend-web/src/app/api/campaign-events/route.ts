import { NextResponse } from 'next/server';

const campaignEvents = [
  'campaign_page_visit',
  'campaign_cta_click',
  'campaign_contributor_interest',
] as const;

type CampaignEventName = (typeof campaignEvents)[number];

type CampaignEventRequest = {
  event?: CampaignEventName;
  campaign?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
};

type SanitizedPayload = {
  path?: string;
  referrer?: string;
  source?: string;
  ctaId?: string;
  ctaLabel?: string;
  targetUrl?: string;
  interestArea?: string;
};

function isCampaignEventName(event: unknown): event is CampaignEventName {
  return typeof event === 'string' && campaignEvents.includes(event as CampaignEventName);
}

function sanitizeString(value: unknown, maxLength = 160) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.slice(0, maxLength);
}

function sanitizePayload(payload: CampaignEventRequest['payload']): SanitizedPayload {
  if (!payload) {
    return {};
  }

  return {
    path: sanitizeString(payload.path),
    referrer: sanitizeString(payload.referrer, 240),
    source: sanitizeString(payload.source),
    ctaId: sanitizeString(payload.ctaId),
    ctaLabel: sanitizeString(payload.ctaLabel),
    targetUrl: sanitizeString(payload.targetUrl, 240),
    interestArea: sanitizeString(payload.interestArea),
  };
}

export async function POST(request: Request) {
  let body: CampaignEventRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isCampaignEventName(body.event) || body.campaign !== 'grantfox-oss-stellar') {
    return NextResponse.json({ error: 'Unsupported campaign event' }, { status: 400 });
  }

  const analyticsEvent = {
    event: body.event,
    campaign: body.campaign,
    timestamp: sanitizeString(body.timestamp) ?? new Date().toISOString(),
    payload: sanitizePayload(body.payload),
  };

  console.info('[campaign-analytics]', analyticsEvent);

  return NextResponse.json({ ok: true });
}

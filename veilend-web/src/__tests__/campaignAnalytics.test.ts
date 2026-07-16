import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { trackCampaignEvent } from '@/lib/campaignAnalytics';
import { POST } from '@/app/api/campaign-events/route';

const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

describe('trackCampaignEvent', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'fetch', {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() } as any);
    window.history.pushState({}, '', '/campaign?utm_source=test-source');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).fetch;
    delete (globalThis as any).fetch;
  });

  it('uses navigator.sendBeacon when available', () => {
    trackCampaignEvent('campaign_cta_click', { ctaId: 'button-1' });

    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(navigator.sendBeacon).toHaveBeenCalledWith('/api/campaign-events', expect.any(Blob));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('campaign events route', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid JSON payload', async () => {
    const request = new Request('http://localhost/api/campaign-events', {
      method: 'POST',
      body: '{invalid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON payload' });
  });

  it('returns 400 for unsupported campaign events', async () => {
    const request = new Request('http://localhost/api/campaign-events', {
      method: 'POST',
      body: JSON.stringify({ event: 'invalid_event', campaign: 'grantfox-oss-stellar' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unsupported campaign event' });
  });

  it('accepts valid campaign events and sanitizes payload values', async () => {
    const requestBody = {
      event: 'campaign_cta_click',
      campaign: 'grantfox-oss-stellar',
      timestamp: ' 2026-07-16T12:00:00Z ',
      payload: {
        path: ' /dashboard ',
        referrer: '  ',
        source: ' campaign ',
        ctaId: '  join-button  ',
        ctaLabel: '  Join Now  ',
        targetUrl: ' https://example.com/page ',
        interestArea: '  lending ',
      },
    };

    const request = new Request('http://localhost/api/campaign-events', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[campaign-analytics]',
      expect.objectContaining({
        event: 'campaign_cta_click',
        campaign: 'grantfox-oss-stellar',
        payload: expect.objectContaining({
          path: '/dashboard',
          source: 'campaign',
          ctaId: 'join-button',
          ctaLabel: 'Join Now',
          targetUrl: 'https://example.com/page',
          interestArea: 'lending',
        }),
      })
    );
  });
});

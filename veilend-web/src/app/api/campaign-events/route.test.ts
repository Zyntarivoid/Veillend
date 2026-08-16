import { describe, expect, it, beforeEach } from 'vitest';
import { POST, resetDedupCache, resetRateLimits } from './route';

describe('API Route: /api/campaign-events', () => {
  beforeEach(() => {
    resetDedupCache();
    resetRateLimits();
  });

  describe('Deduplication (Test c)', () => {
    it('returns 200 on first submission and 409 Conflict when submitting the same event ID twice', async () => {
      const eventId = 'unique-evt-id-9999';
      const payload = {
        id: eventId,
        sessionId: 'session-123',
        ts: new Date().toISOString(),
        type: 'campaign_page_visit',
        payload: { path: '/home' },
      };

      // First submission -> status 200
      const req1 = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '192.168.1.1',
        },
        body: JSON.stringify(payload),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.ok).toBe(true);
      expect(json1.id).toBe(eventId);

      // Second submission with exact same ID -> status 409 Conflict
      const req2 = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '192.168.1.1',
        },
        body: JSON.stringify(payload),
      });

      const res2 = await POST(req2);
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.error).toBe('Duplicate event ID');
    });
  });

  describe('Schema validation', () => {
    it('returns 400 when the body fails the campaign event schema', async () => {
      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt-bad', type: 'not_a_campaign_event' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Unsupported campaign event');
    });
  });

  describe('Rate Limiting (Test d)', () => {
    it('returns 429 Too Many Requests on the 61st request from the same IP within 1 minute', async () => {
      const clientIp = '10.0.0.42';

      // Send 60 successful requests from the same IP
      for (let i = 1; i <= 60; i++) {
        const req = new Request('http://localhost:3000/api/campaign-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': clientIp,
          },
          body: JSON.stringify({
            id: `event-ip-test-${i}`,
            sessionId: 'sess-rate-limit',
            ts: new Date().toISOString(),
            type: 'campaign_cta_click',
            payload: { ctaId: `cta-${i}` },
          }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 61st request from same IP -> 429 Too Many Requests
      const req61 = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          id: 'event-ip-test-61',
          sessionId: 'sess-rate-limit',
          ts: new Date().toISOString(),
          type: 'campaign_cta_click',
          payload: { ctaId: 'cta-61' },
        }),
      });

      const res61 = await POST(req61);
      expect(res61.status).toBe(429);
      const json61 = await res61.json();
      expect(json61.error).toBe('Rate limit exceeded');
    });
  });

  describe('Origin Validation', () => {
    it('returns 403 Forbidden when origin header is not in allowlist', async () => {
      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://malicious-site.com',
        },
        body: JSON.stringify({
          id: 'evt-origin-test',
          type: 'campaign_page_visit',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden origin');
    });
  });
});

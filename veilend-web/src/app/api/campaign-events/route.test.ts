import { describe, expect, it, beforeEach } from 'vitest';
import { POST, resetDedupCache, resetRateLimits } from './route';

// Deterministic UUID-shaped test ids: 8-4-4-4-12 hex, version nibble fixed
// to '4' so they satisfy z.string().uuid() like real crypto.randomUUID().
function testUuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: testUuid(1),
    sessionId: testUuid(2),
    ts: Date.now(),
    type: 'campaign_page_visit',
    payload: { path: '/home' },
    ...overrides,
  };
}

describe('API Route: /api/campaign-events', () => {
  beforeEach(() => {
    resetDedupCache();
    resetRateLimits();
  });

  describe('Deduplication (Test c)', () => {
    it('returns 200 on first submission and 409 Conflict when submitting the same event ID twice', async () => {
      const payload = makeEvent();

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
      expect(json1.id).toBe(payload.id);

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
          body: JSON.stringify(
            makeEvent({ id: testUuid(1000 + i), type: 'campaign_cta_click', payload: { ctaId: `cta-${i}` } })
          ),
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
        body: JSON.stringify(
          makeEvent({ id: testUuid(1061), type: 'campaign_cta_click', payload: { ctaId: 'cta-61' } })
        ),
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
        body: JSON.stringify(makeEvent()),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden origin');
    });
  });

  describe('Zod schema validation', () => {
    it('returns 422 with flattened issues for an unsupported event type', async () => {
      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeEvent({ type: 'not_a_real_event' })),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.issues.fieldErrors.type).toBeTruthy();
    });

    it('returns 422 when the id field is missing', async () => {
      const event = makeEvent();
      delete (event as Record<string, unknown>).id;

      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.issues.fieldErrors.id).toBeTruthy();
    });

    it('returns 422 when the payload exceeds the 1MB size guard', async () => {
      const oversizedValue = 'x'.repeat(1_050_000);
      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeEvent({ payload: { blob: oversizedValue } })),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.issues.fieldErrors.payload).toBeTruthy();
    });

    it('returns 200 for a fully valid event', async () => {
      const req = new Request('http://localhost:3000/api/campaign-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeEvent({ id: testUuid(42) })),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });
});

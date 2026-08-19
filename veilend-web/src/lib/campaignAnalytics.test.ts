import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  trackCampaignEvent,
  track,
  processedEventIds,
  getPendingQueue,
  clearPendingQueue,
  flushQueue,
} from './campaignAnalytics';

describe('campaignAnalytics', () => {
  let localStorageStore: Record<string, string> = {};
  let sessionStorageStore: Record<string, string> = {};

  beforeEach(() => {
    processedEventIds.clear();
    localStorageStore = {};
    sessionStorageStore = {};

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => localStorageStore[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
    };

    const mockSessionStorage = {
      getItem: vi.fn((key: string) => sessionStorageStore[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        sessionStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete sessionStorageStore[key];
      }),
      clear: vi.fn(() => {
        sessionStorageStore = {};
      }),
    };

    vi.stubGlobal('window', {
      location: { pathname: '/', search: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal('document', {
      referrer: 'https://example.com',
      visibilityState: 'visible',
    });

    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('sessionStorage', mockSessionStorage);

    clearPendingQueue();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('StrictMode double-mount & deduplication (Test a)', () => {
    it('fires POST exactly once per event type when track() is called with the same event ID', async () => {
      const fetchSpy = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id: body.id }),
        };
      });
      vi.stubGlobal('fetch', fetchSpy);

      const eventId = '00000000-0000-4000-8000-000000000123';

      // Simulating React StrictMode mount 1
      const res1 = track('campaign_page_visit', { path: '/' }, eventId);
      expect(res1).not.toBeNull();
      expect(res1?.id).toBe(eventId);

      // Simulating React StrictMode mount 2 (double-mount with same eventId)
      const res2 = track('campaign_page_visit', { path: '/' }, eventId);
      expect(res2).toBeNull(); // Deduplicated no-op

      // Wait for any pending async flushQueue promises
      await flushQueue();

      // Only 1 fetch POST call should have been fired
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const postBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(postBody.id).toBe(eventId);
      expect(postBody.type).toBe('campaign_page_visit');
    });

    it('generates unique event IDs for distinct track calls', async () => {
      const fetchSpy = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id: body.id }),
        };
      });
      vi.stubGlobal('fetch', fetchSpy);

      const res1 = trackCampaignEvent('campaign_page_visit');
      const res2 = trackCampaignEvent('campaign_cta_click');

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();
      expect(res1?.id).not.toBe(res2?.id);

      await flushQueue();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event transport & retry queue (Test b)', () => {
    it('drops malformed stored events while retaining valid queued events', () => {
      const validEvent = {
        id: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
        ts: Date.now(),
        type: 'campaign_page_visit',
        payload: { path: '/' },
      };
      localStorageStore.veilend_campaign_pending_events = JSON.stringify([
        validEvent,
        { id: 42, type: 'corrupt' },
      ]);

      expect(getPendingQueue()).toEqual([validEvent]);
      expect(JSON.parse(localStorageStore.veilend_campaign_pending_events)).toEqual([validEvent]);
    });

    it('keeps an event queued when the success response shape is invalid', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, id: 42 }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      const event = trackCampaignEvent('campaign_cta_click', { ctaId: 'btn-invalid' });
      await flushQueue();

      expect(getPendingQueue()).toEqual([event]);
    });

    it('enqueues failed fetch events and empties queue after POST returns 2xx on retries', async () => {
      // 1. Inject failing fetch
      const failingFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', failingFetch);

      // Track event while network is failing
      const event = trackCampaignEvent('campaign_cta_click', { ctaId: 'btn-1' });
      expect(event).not.toBeNull();

      // Event should be in localStorage pending queue
      let queue = getPendingQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe(event?.id);

      // Attempt Retry 1 (still failing)
      await flushQueue();
      expect(getPendingQueue().length).toBe(1);

      // Attempt Retry 2 (still failing)
      await flushQueue();
      expect(getPendingQueue().length).toBe(1);

      // Attempt Retry 3 (still failing)
      await flushQueue();
      queue = getPendingQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe(event?.id);

      // 2. Network recovers: POST returns 2xx (200 OK)
      const successFetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id: body.id }),
        };
      });
      vi.stubGlobal('fetch', successFetch);

      // Drain/flush queue after recovery
      await flushQueue();

      // Queue should now be empty
      expect(getPendingQueue().length).toBe(0);
      expect(successFetch).toHaveBeenCalledTimes(1);
    });
  });
});

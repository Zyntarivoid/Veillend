import { parseJsonWithSchema } from './api/fetch-json';
import { ValidationError } from './api/errors';
import { reportError } from './api/report-error';
import {
  campaignEventSchema,
  campaignEventsResponseSchema,
  type CampaignEvent,
  type CampaignEventName,
  type CampaignEventPayload,
} from './schemas/campaign';

export type { CampaignEvent, CampaignEventName, CampaignEventPayload };

const ANALYTICS_ENDPOINT = '/api/campaign-events';
const QUEUE_STORAGE_KEY = 'veilend_campaign_pending_events';
const SESSION_STORAGE_KEY = 'veilend_campaign_session_id';

export const processedEventIds = new Set<string>();

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return 'ssr_session';
  }
  try {
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid = generateUUID();
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return 'fallback_session';
  }
}

export function getPendingQueue(): CampaignEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = campaignEventSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function savePendingQueue(queue: CampaignEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage errors
  }
}

export function enqueueEvent(event: CampaignEvent): void {
  const queue = getPendingQueue();
  if (!queue.some((e) => e.id === event.id)) {
    queue.push(event);
    savePendingQueue(queue);
  }
}

export function removeFromQueue(id: string): void {
  const queue = getPendingQueue();
  const updated = queue.filter((e) => e.id !== id);
  savePendingQueue(updated);
}

export function clearPendingQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

let isFlushing = false;
let flushPromise: Promise<void> | null = null;

async function flushQueueOnce(): Promise<void> {
  if (typeof window === 'undefined' || isFlushing) return;

  isFlushing = true;
  try {
    while (true) {
      const queue = getPendingQueue();
      if (queue.length === 0) break;

      const event = queue[0];
      try {
        const response = await fetch(ANALYTICS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
          keepalive: true,
        });

        if (response.ok) {
          await parseJsonWithSchema(
            response,
            campaignEventsResponseSchema,
            ANALYTICS_ENDPOINT,
          );
          removeFromQueue(event.id);
        } else if (response.status === 409) {
          removeFromQueue(event.id);
        } else {
          break;
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          reportError(error, 'Campaign event response failed validation');
          removeFromQueue(event.id);
          continue;
        }
        break;
      }
    }
  } finally {
    isFlushing = false;
  }
}

export async function flushQueue(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (flushPromise) {
    await flushPromise;
    return;
  }
  flushPromise = flushQueueOnce().finally(() => {
    flushPromise = null;
  });
  await flushPromise;
}

function isDebugEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG === 'true') {
    return true;
  }
  if (typeof window !== 'undefined' && (window as unknown as { __DEBUG__?: boolean }).__DEBUG__) {
    return true;
  }
  return false;
}

export function trackCampaignEvent(
  event: CampaignEventName,
  payload: CampaignEventPayload = {},
  customId?: string
): CampaignEvent | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const id = customId || generateUUID();

  if (processedEventIds.has(id)) {
    return null;
  }

  processedEventIds.add(id);

  const timestamp = new Date().toISOString();
  const fullEvent: CampaignEvent = {
    id,
    sessionId: getSessionId(),
    ts: timestamp,
    type: event,
    payload: {
      path: window.location.pathname,
      source: new URLSearchParams(window.location.search).get('utm_source') ?? undefined,
      ...payload,
    },
    // Backwards compatibility fields
    event,
    campaign: 'grantfox-oss-stellar',
    timestamp,
  };

  if (isDebugEnabled()) {
    console.debug(`[campaign-analytics] Event ${id} tracked:`, fullEvent);
    const win = window as unknown as { Sentry?: { addBreadcrumb?: (data: unknown) => void } };
    if (win.Sentry?.addBreadcrumb) {
      win.Sentry.addBreadcrumb({
        category: 'campaign-analytics',
        message: `Campaign Event ${id} (${event})`,
        level: 'info',
        data: fullEvent,
      });
    }
  }

  enqueueEvent(fullEvent);
  void flushQueue();

  return fullEvent;
}

export function track(
  event: CampaignEventName,
  payload?: CampaignEventPayload,
  customId?: string
): CampaignEvent | null {
  return trackCampaignEvent(event, payload, customId);
}

// Setup background retry listeners in browser environment
if (typeof window !== 'undefined') {
  void flushQueue();
  setInterval(() => {
    void flushQueue();
  }, 30000);
  window.addEventListener('online', () => {
    void flushQueue();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flushQueue();
    }
  });
}


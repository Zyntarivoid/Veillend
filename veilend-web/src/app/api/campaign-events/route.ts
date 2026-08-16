import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseOr422 } from '@/lib/server/validation';
import { captureEvent } from '@/lib/server/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const CAMPAIGN_EVENT_TYPES = [
  'campaign_page_visit',
  'campaign_cta_click',
  'campaign_contributor_interest',
] as const;

// Rejects payloads over ~1MB so a bad client can't flood the dedup cache
// or logs with oversized JSON blobs.
const MAX_PAYLOAD_BYTES = 1_000_000;

export const CampaignEventSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    ts: z.number().int().positive(),
    type: z.enum(CAMPAIGN_EVENT_TYPES),
    campaign: z.literal('grantfox-oss-stellar').default('grantfox-oss-stellar'),
    payload: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payload && JSON.stringify(data.payload).length > MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_PAYLOAD_BYTES,
        type: 'string',
        inclusive: true,
        path: ['payload'],
        message: `Payload exceeds ${MAX_PAYLOAD_BYTES} byte limit`,
      });
    }
  });

export type CampaignEventInput = z.infer<typeof CampaignEventSchema>;

// Per-IP Rate Limiting (60 requests per 1 minute window)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function resetRateLimits(): void {
  rateLimitStore.clear();
}

// In-Memory LRU Dedup Cache keyed on event ID
const DEDUP_CACHE_MAX_SIZE = 10000;
const dedupCache = new Map<string, number>();

export function resetDedupCache(): void {
  dedupCache.clear();
}

function isDuplicateEvent(id: string): boolean {
  if (dedupCache.has(id)) {
    return true;
  }
  if (dedupCache.size >= DEDUP_CACHE_MAX_SIZE) {
    const firstKey = dedupCache.keys().next().value;
    if (firstKey !== undefined) {
      dedupCache.delete(firstKey);
    }
  }
  dedupCache.set(id, Date.now());
  return false;
}

function isAllowedOrigin(originHeader: string | null): boolean {
  if (!originHeader) {
    return true;
  }

  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL || process.env.ALLOWED_ORIGIN;
  const defaultAllowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://veillend.app',
  ];

  if (configuredOrigin && originHeader === configuredOrigin) {
    return true;
  }

  if (defaultAllowed.includes(originHeader)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(originHeader);
    if (
      parsedOrigin.hostname === 'localhost' ||
      parsedOrigin.hostname === '127.0.0.1'
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function POST(request: Request) {
  // 1. Check Origin Header Validation (403 if invalid)
  const originHeader = request.headers.get('origin');
  if (!isAllowedOrigin(originHeader)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  // 2. Check Rate Limit by IP (429 if exceeded)
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const now = Date.now();
  let ipRecord = rateLimitStore.get(clientIp);

  if (!ipRecord || now > ipRecord.resetTime) {
    ipRecord = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(clientIp, ipRecord);
  } else {
    ipRecord.count += 1;
  }

  if (ipRecord.count > RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
        },
      }
    );
  }

  // 3. Parse JSON Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // 4. Validate against the Zod schema (422 + flattened issues on failure,
  //    telemetry already captured inside parseOr422)
  let parsed: { data: CampaignEventInput };
  try {
    parsed = await parseOr422(CampaignEventSchema, body);
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    throw err;
  }

  const event = parsed.data;

  // 5. In-Memory Dedup Check (409 Conflict if duplicate)
  if (isDuplicateEvent(event.id)) {
    return NextResponse.json(
      { error: 'Duplicate event ID', id: event.id },
      { status: 409 }
    );
  }

  captureEvent({ kind: 'campaign_event', ...event });

  return NextResponse.json({ ok: true, id: event.id });
}

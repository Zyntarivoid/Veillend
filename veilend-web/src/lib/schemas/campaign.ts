import { z } from 'zod';

export const campaignEventNames = [
  'campaign_page_visit',
  'campaign_cta_click',
  'campaign_contributor_interest',
] as const;

export const campaignEventNameSchema = z.enum(campaignEventNames);

export const campaignEventPayloadSchema = z
  .object({
    path: z.string().optional(),
    referrer: z.string().optional(),
    source: z.string().optional(),
    ctaId: z.string().optional(),
    ctaLabel: z.string().optional(),
    targetUrl: z.string().optional(),
    interestArea: z.string().optional(),
  })
  .passthrough();

export const campaignEventSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().optional(),
    ts: z.string().optional(),
    timestamp: z.string().optional(),
    type: campaignEventNameSchema.optional(),
    event: campaignEventNameSchema.optional(),
    campaign: z.string().optional(),
    payload: campaignEventPayloadSchema.optional(),
  })
  .refine((event) => Boolean(event.type || event.event), {
    message: 'Missing campaign event name',
    path: ['type'],
  });

export const campaignEventRequestSchema = campaignEventSchema;

export const campaignEventsResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().optional(),
});

export type CampaignEventName = z.infer<typeof campaignEventNameSchema>;
export type CampaignEventPayload = z.infer<typeof campaignEventPayloadSchema>;
export type CampaignEvent = z.infer<typeof campaignEventSchema>;
export type CampaignEventsResponse = z.infer<typeof campaignEventsResponseSchema>;

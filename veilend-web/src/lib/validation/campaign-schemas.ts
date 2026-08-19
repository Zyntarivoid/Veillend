import { z } from 'zod';

export const CAMPAIGN_EVENT_TYPES = [
  'campaign_page_visit',
  'campaign_cta_click',
  'campaign_contributor_interest',
] as const;

export const MAX_CAMPAIGN_PAYLOAD_BYTES = 1_000_000;

const CampaignPayloadValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.undefined(),
]);

export const CampaignEventPayloadSchema = z
  .object({
    path: z.string().optional(),
    referrer: z.string().optional(),
    source: z.string().optional(),
    ctaId: z.string().optional(),
    ctaLabel: z.string().optional(),
    targetUrl: z.string().optional(),
    interestArea: z.string().optional(),
  })
  .catchall(CampaignPayloadValueSchema);

export const CampaignEventSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    ts: z.number().int().positive(),
    type: z.enum(CAMPAIGN_EVENT_TYPES),
    payload: CampaignEventPayloadSchema.optional().default({}),
    event: z.enum(CAMPAIGN_EVENT_TYPES).optional(),
    campaign: z.literal('grantfox-oss-stellar').optional(),
    timestamp: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (JSON.stringify(data.payload).length > MAX_CAMPAIGN_PAYLOAD_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_CAMPAIGN_PAYLOAD_BYTES,
        type: 'string',
        inclusive: true,
        path: ['payload'],
        message: `Payload exceeds ${MAX_CAMPAIGN_PAYLOAD_BYTES} byte limit`,
      });
    }
  });

export const CampaignEventResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
});

export type CampaignEventName = z.infer<typeof CampaignEventSchema>['type'];
export type CampaignEventPayload = z.infer<typeof CampaignEventPayloadSchema>;
export type CampaignEvent = z.infer<typeof CampaignEventSchema>;
export type CampaignEventInput = z.input<typeof CampaignEventSchema>;

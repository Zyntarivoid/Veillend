import { z } from 'zod';

export const oraclePricesResponseSchema = z.object({
  prices: z.record(z.string(), z.number().finite()),
});

export type OraclePricesResponse = z.infer<typeof oraclePricesResponseSchema>;

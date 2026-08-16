import { z } from 'zod';
import { toSafeBigInt, toSafeNumber } from '../validation/coerce';

const rawAmountSchema = z.union([z.string(), z.number(), z.bigint()]);

function isCoercibleAmount(value: unknown): boolean {
  return toSafeBigInt(value) !== null || toSafeNumber(value) !== null;
}

function addInvalidAmountIssue(
  ctx: z.RefinementCtx,
  path: string,
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: [path],
  });
}

export const indexerPositionSchema = z
  .object({
    userAddress: z.string().optional(),
    assetAddress: z.string().min(1),
    depositedRaw: rawAmountSchema.optional(),
    deposited: rawAmountSchema.optional(),
    depositedAmount: rawAmountSchema.optional(),
    borrowedRaw: rawAmountSchema.optional(),
    borrowed: rawAmountSchema.optional(),
    borrowedAmount: rawAmountSchema.optional(),
    updatedAt: z.string().optional(),
  })
  .superRefine((position, ctx) => {
    const deposited = position.depositedRaw ?? position.deposited ?? position.depositedAmount;
    const borrowed = position.borrowedRaw ?? position.borrowed ?? position.borrowedAmount;

    if (deposited === undefined && borrowed === undefined) {
      addInvalidAmountIssue(ctx, 'depositedRaw', 'missing deposited/borrowed amount');
      return;
    }

    if (deposited !== undefined && !isCoercibleAmount(deposited)) {
      addInvalidAmountIssue(ctx, 'depositedRaw', 'invalid deposited amount');
    }

    if (borrowed !== undefined && !isCoercibleAmount(borrowed)) {
      addInvalidAmountIssue(ctx, 'borrowedRaw', 'invalid borrowed amount');
    }
  });

export const indexerPositionsResponseSchema = z.object({
  address: z.string().optional(),
  positions: z.array(indexerPositionSchema),
});

export const indexerTransactionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  amount: rawAmountSchema,
  assetAddress: z.string().min(1),
  timestamp: z.string().min(1),
  txHash: z.string().optional(),
  userAddress: z.string().optional(),
  ledger: z.number().optional(),
});

export const indexerTransactionsResponseSchema = z.object({
  address: z.string().optional(),
  transactions: z.array(indexerTransactionSchema),
});

export type IndexerPosition = z.infer<typeof indexerPositionSchema>;
export type IndexerPositionsResponse = z.infer<typeof indexerPositionsResponseSchema>;
export type IndexerTransaction = z.infer<typeof indexerTransactionSchema>;
export type IndexerTransactionsResponse = z.infer<typeof indexerTransactionsResponseSchema>;

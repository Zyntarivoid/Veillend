import { z } from 'zod';

export const StellarAddressSchema = z
  .string()
  .min(1, 'Address is required')
  .regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar public key format');

export const AssetSymbolSchema = z
  .string()
  .min(1, 'Asset symbol is required')
  .max(12, 'Asset symbol too long');

export const ActionTypeSchema = z.enum(['DEPOSIT', 'WITHDRAW', 'BORROW', 'REPAY']);

/**
 * Base Zod Schema for client-side action validation (Step a of pipeline)
 */
export const ActionInputSchema = z.object({
  action: ActionTypeSchema,
  userAddress: StellarAddressSchema,
  assetSymbol: AssetSymbolSchema,
  assetAddress: z.string().min(1, 'Asset address is required'),
  amount: z.number({ message: 'Amount must be a number' }).positive('Amount must be greater than zero'),
  availableBalance: z.number().min(0, 'Available balance cannot be negative'),
  depositedBalance: z.number().min(0).optional(),
  borrowedBalance: z.number().min(0).optional(),
  priceUsd: z.number().positive('Price must be greater than zero'),
  borrowLimitUsd: z.number().min(0).optional(),
  decimals: z.number().int().min(0).max(18).optional().default(7),
}).superRefine((data, ctx) => {
  const decimals = data.decimals ?? 7;
  // Precision check (Stellar assets default to 7 decimals)
  const factor = 10 ** decimals;
  const scaled = data.amount * factor;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amount'],
      message: `Amount exceeds maximum precision of ${decimals} decimal places.`,
    });
  }

  // Specific action balance constraint checks
  if (data.action === 'DEPOSIT' && data.amount > data.availableBalance) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amount'],
      message: `Deposit amount (${data.amount}) exceeds wallet balance (${data.availableBalance}).`,
    });
  }

  if (data.action === 'WITHDRAW') {
    const deposited = data.depositedBalance ?? data.availableBalance;
    if (data.amount > deposited) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `Withdrawal amount (${data.amount}) exceeds deposited balance (${deposited}).`,
      });
    }
  }

  if (data.action === 'BORROW') {
    const usdValue = data.amount * data.priceUsd;
    if (data.borrowLimitUsd !== undefined && usdValue > data.borrowLimitUsd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `Borrow USD value ($${usdValue.toFixed(2)}) exceeds borrow limit ($${data.borrowLimitUsd.toFixed(2)}).`,
      });
    }
  }

  if (data.action === 'REPAY') {
    const debt = data.borrowedBalance ?? 0;
    if (debt > 0 && data.amount > debt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `Repay amount (${data.amount}) exceeds outstanding debt (${debt}).`,
      });
    }
    if (data.amount > data.availableBalance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `Repay amount (${data.amount}) exceeds available wallet balance (${data.availableBalance}).`,
      });
    }
  }
});

export type ActionInput = z.input<typeof ActionInputSchema>;

export function validateActionInput(input: unknown) {
  return ActionInputSchema.safeParse(input);
}

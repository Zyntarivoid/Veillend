import { z } from 'zod';

export type ValidationPath = ReadonlyArray<string | number>;

const formatPath = (path: ValidationPath): string => path.map(String).join('.');

export class ValidationError extends Error {
  readonly path: string;

  constructor(message: string, path: ValidationPath = [], options?: ErrorOptions) {
    const formattedPath = formatPath(path);
    super(formattedPath ? `${formattedPath}: ${message}` : message, options);
    this.name = 'ValidationError';
    this.path = formattedPath;
  }

  static fromZodError(error: z.ZodError, prefix: ValidationPath = []): ValidationError {
    const issue = error.issues[0];
    return new ValidationError(
      issue?.message ?? 'Response validation failed',
      [...prefix, ...(issue?.path ?? [])],
      { cause: error }
    );
  }
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`HTTP ${status}${statusText ? `: ${statusText}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const parseApiResponse = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
  path: ValidationPath = []
): z.output<Schema> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ValidationError.fromZodError(result.error, path);
  }
  return result.data;
};

const IntegerLikeSchema = z.union([
  z.string().regex(/^-?\d+$/, 'Expected an integer string'),
  z.number().int().safe(),
]);

const IndexerPositionAliasesSchema = z
  .object({
    userAddress: z.string().optional(),
    assetAddress: z.string().min(1),
    deposited: z.unknown().optional(),
    borrowed: z.unknown().optional(),
    depositedRaw: z.unknown().optional(),
    borrowedRaw: z.unknown().optional(),
    depositedAmount: z.unknown().optional(),
    borrowedAmount: z.unknown().optional(),
    updatedAt: z.string().optional(),
  })
  .superRefine((value, context) => {
    const deposited = value.deposited ?? value.depositedRaw ?? value.depositedAmount;
    const borrowed = value.borrowed ?? value.borrowedRaw ?? value.borrowedAmount;
    if (!IntegerLikeSchema.safeParse(deposited).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositedRaw'],
        message: 'Expected an integer string',
      });
    }
    if (!IntegerLikeSchema.safeParse(borrowed).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['borrowedRaw'],
        message: 'Expected an integer string',
      });
    }
  })
  .transform((value) => {
    const deposited = value.deposited ?? value.depositedRaw ?? value.depositedAmount;
    const borrowed = value.borrowed ?? value.borrowedRaw ?? value.borrowedAmount;
    return {
      assetAddress: value.assetAddress,
      depositedRaw: String(deposited),
      borrowedRaw: String(borrowed),
    };
  });

export const IndexerPositionsResponseSchema = z.object({
  positions: z.array(IndexerPositionAliasesSchema),
});

export const IndexerTransactionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  amount: IntegerLikeSchema.transform(String),
  assetAddress: z.string().min(1),
  timestamp: z.string().min(1),
  txHash: z.string(),
});

export const IndexerTransactionsResponseSchema = z.object({
  transactions: z.array(IndexerTransactionSchema),
});

export const OraclePricesResponseSchema = z.object({
  prices: z.record(z.string(), z.number().finite()),
});

export const AssetRegistryItemSchema = z.object({
  symbol: z.string().optional(),
  code: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().int().min(0).max(100).optional(),
  contractId: z.string().nullable().optional(),
  isNative: z.boolean().optional(),
  logoUrl: z.string().nullable().optional(),
  minCollateralRatio: z.number().finite().nullable().optional(),
});

const AssetRegistryArraySchema = z.array(AssetRegistryItemSchema);

export const AssetRegistryResponseSchema = z
  .union([
    AssetRegistryArraySchema,
    z.object({ data: AssetRegistryArraySchema }),
    z.object({ assets: AssetRegistryArraySchema }),
  ])
  .transform((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    return 'data' in value ? value.data : value.assets;
  });

export type IndexerPosition = z.infer<typeof IndexerPositionAliasesSchema>;
export type IndexerTransaction = z.infer<typeof IndexerTransactionSchema>;
export type AssetRegistryItem = z.infer<typeof AssetRegistryItemSchema>;

export const SupportedAssetItemSchema = z.object({
  code: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(100),
  issuer: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  assetAddress: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  isNative: z.boolean().optional(),
  isSupported: z.boolean(),
  minCollateralRatio: z.number().finite().nullable().optional(),
  priceUsd: z.number().finite().optional(),
  price: z.number().finite().optional(),
  walletBalance: z.number().finite().optional(),
  depositedBalance: z.number().finite().optional(),
  borrowedBalance: z.number().finite().optional(),
});

const SupportedAssetArraySchema = z.array(SupportedAssetItemSchema).min(1);

export const SupportedAssetsResponseSchema = z
  .union([
    SupportedAssetArraySchema,
    z.object({ data: SupportedAssetArraySchema }),
    z.object({ assets: SupportedAssetArraySchema }),
  ])
  .transform((value) => {
    if (Array.isArray(value)) return value;
    return 'data' in value ? value.data : value.assets;
  });

export const AuthNonceResponseSchema = z.object({
  nonce: z.string().min(1),
});

export const AuthNonceRequestSchema = z.object({
  walletAddress: z.string().min(1),
});

export const AuthVerifyRequestSchema = z.object({
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
});

export const AuthVerificationResponseSchema = z.object({
  accessToken: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
});

export const AuthSessionResponseSchema = z.object({
  walletAddress: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
});

const JwtWalletAddressSchema = z.string().startsWith('G');

export const JwtPayloadSchema = z
  .object({
    walletAddress: JwtWalletAddressSchema.optional(),
    sub: JwtWalletAddressSchema.optional(),
  })
  .refine((payload) => payload.walletAddress !== undefined || payload.sub !== undefined, {
    message: 'JWT payload does not contain a wallet address',
  });

export type SupportedAssetItem = z.infer<typeof SupportedAssetItemSchema>;
export type AuthVerificationResult = z.infer<typeof AuthVerificationResponseSchema>;
export type AuthVerifyRequest = z.infer<typeof AuthVerifyRequestSchema>;

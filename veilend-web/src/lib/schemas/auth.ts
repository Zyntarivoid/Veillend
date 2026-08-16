import { z } from 'zod';

export const authNonceResponseSchema = z.object({
  nonce: z.string().min(1),
});

export const authVerifyResponseSchema = z.object({
  accessToken: z.string().min(1),
  sessionId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const authSessionResponseSchema = z.object({
  walletAddress: z.string().min(1),
  sessionId: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const authSessionStorageSchema = z.object({
  address: z.string().min(1),
  publicKey: z.string().min(1),
  authenticated: z.boolean(),
  sessionId: z.string().optional(),
  accessToken: z.string().optional(),
  expiresAt: z.string().optional(),
  lastVerifiedAt: z.string().optional(),
});

export type AuthNonceResponse = z.infer<typeof authNonceResponseSchema>;
export type AuthVerifyResponse = z.infer<typeof authVerifyResponseSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type AuthSession = z.infer<typeof authSessionStorageSchema>;

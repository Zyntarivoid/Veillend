import { Expose } from 'class-transformer';

/**
 * Public-facing asset metadata returned by GET /assets.
 * Sensitive internal fields (e.g. Prisma id) are excluded.
 */
export class AssetResponseDto {
  @Expose()
  code: string;

  @Expose()
  symbol: string;

  @Expose()
  name: string;

  @Expose()
  decimals: number;

  @Expose()
  issuer: string | null;

  @Expose()
  contractId: string | null;

  @Expose()
  logoUrl: string | null;

  @Expose()
  isNative: boolean;

  @Expose()
  isSupported: boolean;
}

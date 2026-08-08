import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Public-facing asset metadata returned by GET /assets.
 * Sensitive internal fields (e.g. Prisma id) are excluded.
 */
export class AssetResponseDto {
  @ApiProperty({ example: 'USDC' })
  @Expose()
  code: string;

  @ApiProperty({ example: 'USDC' })
  @Expose()
  symbol: string;

  @ApiProperty({ example: 'USD Coin' })
  @Expose()
  name: string;

  @ApiProperty({ example: 7 })
  @Expose()
  decimals: number;

  @ApiPropertyOptional({
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    nullable: true,
  })
  @Expose()
  issuer: string | null;

  @ApiPropertyOptional({
    example: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
    nullable: true,
  })
  @Expose()
  contractId: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/usdc.png', nullable: true })
  @Expose()
  logoUrl: string | null;

  @ApiProperty({ example: false })
  @Expose()
  isNative: boolean;

  @ApiProperty({ example: true })
  @Expose()
  isSupported: boolean;
}

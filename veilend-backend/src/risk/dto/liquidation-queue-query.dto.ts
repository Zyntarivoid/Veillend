import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LiquidationQueueQueryDto {
  /** Page size (max 200). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  /** Opaque keyset cursor from the previous page (`meta.nextCursor`). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minHealthFactor?: number;

  /** Only users with open debt in this asset code (e.g. XLM, USDC). */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  asset?: string;

  /** Minimum estimated seizable value in USD. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSeizableValue?: number;
}

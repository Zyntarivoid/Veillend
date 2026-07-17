import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageOptionsDto } from '../../common/dto/page-options.dto';

/**
 * Normalized event types used in API responses.
 * Maps from the Prisma TransactionType enum to a consistent lowercase format.
 */
export enum NormalizedEventType {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  BORROW = 'borrow',
  REPAY = 'repay',
  LIQUIDATION = 'liquidation',
}

/**
 * Query parameters for paginated transaction history.
 * Extends PageOptionsDto with type/status/asset filters.
 */
export class TransactionHistoryQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({
    description: 'Filter by event type',
    enum: NormalizedEventType,
    example: 'deposit',
  })
  @IsEnum(NormalizedEventType)
  @IsOptional()
  type?: NormalizedEventType;

  @ApiPropertyOptional({
    description: 'Filter by transaction status',
    enum: ['PENDING', 'CONFIRMED', 'FAILED'],
    example: 'CONFIRMED',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by asset ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({
    description: 'Filter transactions starting from this ISO date',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter transactions up to this ISO date',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsString()
  @IsOptional()
  to?: string;
}

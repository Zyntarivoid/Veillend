import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEventType } from './transaction-history-query.dto';

/**
 * Normalized status values used in API responses.
 */
export enum NormalizedStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

/**
 * Represents a single normalized transaction event in the API response.
 * Event types and timestamps are normalized consistently across all sources.
 */
export class TransactionEventDto {
  @ApiProperty({
    description: 'Transaction record UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Normalized event type (lowercase)',
    enum: NormalizedEventType,
    example: 'deposit',
  })
  type: NormalizedEventType;

  @ApiProperty({
    description: 'Normalized transaction status (lowercase)',
    enum: NormalizedStatus,
    example: 'confirmed',
  })
  status: NormalizedStatus;

  @ApiProperty({
    description:
      "Amount in the asset's native precision (as string to preserve BigInt)",
    example: '1000000000',
  })
  amountRaw: string;

  @ApiProperty({
    description: 'USD value at time of transaction',
    example: '100.50',
  })
  amountUsd: string;

  @ApiProperty({
    description: 'Asset code (e.g. USDC, XLM)',
    example: 'USDC',
  })
  assetCode: string;

  @ApiProperty({
    description: 'Asset display symbol',
    example: 'USDC',
  })
  assetSymbol: string;

  @ApiProperty({
    description: 'Stellar transaction hash (if available)',
    example: 'abc123...',
    nullable: true,
  })
  txHash: string | null;

  @ApiProperty({
    description: 'Stellar ledger sequence (if available)',
    example: 45000000,
    nullable: true,
  })
  ledgerSequence: number | null;

  @ApiProperty({
    description: 'Soroban contract ID (if applicable)',
    example: 'CAZQ...',
    nullable: true,
  })
  contractId: string | null;

  @ApiProperty({
    description: 'Transaction memo (if any)',
    example: 'Loan repayment',
    nullable: true,
  })
  memo: string | null;

  @ApiProperty({
    description: 'Event creation timestamp (ISO 8601)',
    example: '2025-07-16T12:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Confirmation timestamp (ISO 8601, null if pending)',
    example: '2025-07-16T12:30:05.000Z',
    nullable: true,
  })
  confirmedAt: string | null;
}

/**
 * Paginated response wrapper for transaction history.
 */
export class TransactionHistoryPageDto {
  @ApiProperty({
    description: 'Array of normalized transaction events',
    type: [TransactionEventDto],
  })
  data: TransactionEventDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    example: {
      page: 1,
      take: 10,
      itemCount: 42,
      pageCount: 5,
      hasPreviousPage: false,
      hasNextPage: true,
    },
  })
  meta: {
    page: number;
    take: number;
    itemCount: number;
    pageCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

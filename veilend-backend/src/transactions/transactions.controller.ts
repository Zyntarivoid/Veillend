import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionsService, TransactionRecord } from './transactions.service';
import { ServiceResponse } from '../stellar/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  TransactionHistoryQueryDto,
  NormalizedEventType,
} from './dto/transaction-history-query.dto';
import { TransactionHistoryPageDto } from './dto/transaction-history-response.dto';

/**
 * Controller for transaction history endpoints.
 * Provides both legacy Horizon-based lookup and normalized database-backed history.
 */
@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * GET /transactions/history
   * Retrieve paginated, normalized transaction history for the authenticated user.
   * Supports filtering by event type, status, asset, and date range.
   */
  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get paginated transaction history',
    description:
      'Retrieve normalized historical activity (deposits, borrows, repayments, withdrawals) for the authenticated user. Supports pagination and filtering by type, status, asset, and date range.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'take',
    required: false,
    type: Number,
    description: 'Items per page, max 50 (default: 10)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order by timestamp (default: DESC)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: NormalizedEventType,
    description: 'Filter by event type',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'CONFIRMED', 'FAILED'],
    description: 'Filter by transaction status',
  })
  @ApiQuery({
    name: 'assetId',
    required: false,
    type: String,
    description: 'Filter by asset ID',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated transaction history retrieved successfully',
    type: TransactionHistoryPageDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTransactionHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: TransactionHistoryQueryDto,
  ): Promise<TransactionHistoryPageDto> {
    return this.transactionsService.getTransactionHistory(
      req.user.walletAddress,
      query,
    );
  }

  /**
   * GET /transactions/:walletAddress
   * Legacy endpoint: retrieves recent transactions from Stellar Horizon.
   */
  @Get(':walletAddress')
  @ApiOperation({
    summary: 'Get recent transactions (Horizon)',
    description:
      'Legacy endpoint that fetches the 20 most recent Stellar transactions for a wallet address from the Horizon API.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent transactions retrieved successfully',
  })
  async getTransactions(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ServiceResponse<TransactionRecord[]>> {
    return this.transactionsService.getTransactions(walletAddress);
  }
}

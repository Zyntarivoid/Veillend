import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TransactionsService, TransactionRecord } from './transactions.service';
import { ServiceResponse } from '../stellar/types';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get(':walletAddress')
  @ApiOperation({
    summary: 'List recent Horizon transactions for a wallet',
  })
  @ApiParam({
    name: 'walletAddress',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          success: true,
          data: [
            {
              id: '…',
              type: 'transfer',
              amount: 1.5,
              asset: 'XLM',
              status: 'success',
              txHash: 'abc…',
            },
          ],
        },
      },
    },
  })
  async getTransactions(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ServiceResponse<TransactionRecord[]>> {
    return this.transactionsService.getTransactions(walletAddress);
  }
}

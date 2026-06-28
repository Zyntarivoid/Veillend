import { Controller, Get, Param } from '@nestjs/common';
import { TransactionsService, TransactionRecord } from './transactions.service';
import { ServiceResponse } from '../stellar/types';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get(':walletAddress')
  async getTransactions(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ServiceResponse<TransactionRecord[]>> {
    return this.transactionsService.getTransactions(walletAddress);
  }
}

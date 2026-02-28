import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { LendingPoolService } from './lending-pool.service';
import { DepositDto, WithdrawDto, BorrowDto, RepayDto } from './dto/lending-pool.dto';

@Controller('lending-pool')
export class LendingPoolController {
  constructor(private readonly svc: LendingPoolService) {}

  @Get('user-data')
  async getUserData(@Query('contract') contract: string, @Query('user') user: string) {
    return this.svc.getUserAccountData(contract, user);
  }

  @Post('deposit')
  async deposit(@Body() dto: DepositDto) {
    return this.svc.deposit(dto.contract, dto.asset, dto.amount, dto.onBehalfOf ?? dto.contract);
  }

  @Post('withdraw')
  async withdraw(@Body() dto: WithdrawDto) {
    return this.svc.withdraw(dto.contract, dto.asset, dto.amount, dto.to ?? dto.contract);
  }

  @Post('borrow')
  async borrow(@Body() dto: BorrowDto) {
    return this.svc.borrow(dto.contract, dto.asset, dto.amount, dto.interestRateMode, dto.onBehalfOf ?? dto.contract);
  }

  @Post('repay')
  async repay(@Body() dto: RepayDto) {
    return this.svc.repay(dto.contract, dto.asset, dto.amount, dto.interestRateMode, dto.onBehalfOf ?? dto.contract);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { PageOptionsDto } from '../common/dto/page-options.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get(':walletAddress/activity')
  getActivityFeed(
    @Param('walletAddress') walletAddress: string,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return this.transactionsService.getActivityFeed(
      walletAddress,
      pageOptionsDto,
    );
  }

  @Get(':walletAddress')
  getHistory(
    @Param('walletAddress') walletAddress: string,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return this.transactionsService.getHistory(walletAddress, pageOptionsDto);
  }
}

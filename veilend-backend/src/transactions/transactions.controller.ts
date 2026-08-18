import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PageDto } from '../common/dto/page.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { TransactionRecordDto } from './dto/transaction-record.dto';
import { WalletAddressParamDto } from '../common/dto/wallet-address-param.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { assertWalletAccess } from '../common/auth/assert-wallet-access';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':walletAddress')
  async getTransactions(
    @Param() { walletAddress }: WalletAddressParamDto,
    @Query() query: GetTransactionsQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto<TransactionRecordDto>> {
    await assertWalletAccess(
      this.prisma,
      req.user.walletAddress,
      walletAddress,
    );
    return this.transactionsService.getTransactions(walletAddress, query);
  }
}

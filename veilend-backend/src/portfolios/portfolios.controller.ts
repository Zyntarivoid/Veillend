import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { PortfolioResponseDto } from './dto/portfolio-response.dto';
import { WalletAddressParamDto } from '../common/dto/wallet-address-param.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { assertWalletAccess } from '../common/auth/assert-wallet-access';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfoliosController {
  constructor(
    private readonly portfoliosService: PortfoliosService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':walletAddress')
  async getPortfolio(
    @Param() { walletAddress }: WalletAddressParamDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PortfolioResponseDto> {
    await assertWalletAccess(
      this.prisma,
      req.user.walletAddress,
      walletAddress,
    );
    return this.portfoliosService.getPortfolio(walletAddress);
  }
}

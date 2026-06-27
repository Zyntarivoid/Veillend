import { Controller, Get, Param } from '@nestjs/common';
import { PortfoliosService, PortfolioData } from './portfolios.service';
import { ServiceResponse } from '../stellar/types';

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get(':walletAddress')
  async getPortfolio(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ServiceResponse<PortfolioData>> {
    return this.portfoliosService.getPortfolio(walletAddress);
  }
}

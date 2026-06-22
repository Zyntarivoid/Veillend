import { Controller, Get, Param } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get(':walletAddress/dashboard')
  getDashboard(@Param('walletAddress') walletAddress: string) {
    return this.portfoliosService.getDashboard(walletAddress);
  }
}

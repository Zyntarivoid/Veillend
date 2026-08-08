import { Controller, Get, Param } from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { PortfolioData } from './dto/portfolio-response.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  /**
   * GET /portfolios/:walletAddress
   * Dashboard summary for a Stellar wallet (Horizon balances + indexed positions).
   */
  @Get(':walletAddress')
  async getPortfolio(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ApiResponseDto<PortfolioData>> {
    const data = await this.portfoliosService.getPortfolio(walletAddress);
    return ApiResponseDto.success(data, {
      empty: data.empty,
      sources: data.source,
    });
  }
}

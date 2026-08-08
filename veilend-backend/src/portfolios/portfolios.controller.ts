import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { PortfoliosService, PortfolioData } from './portfolios.service';
import { ServiceResponse } from '../stellar/types';

@ApiTags('portfolios')
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get(':walletAddress')
  @ApiOperation({
    summary: 'Get dashboard portfolio for a wallet',
    description:
      'Returns balances and summary risk metrics for the given Stellar account. Empty wallets return a successful empty-state payload.',
  })
  @ApiParam({
    name: 'walletAddress',
    description: 'Stellar public key (G…)',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          success: true,
          data: {
            walletAddress: 'G…',
            balance: 12.5,
            collateralValue: 10,
            borrowedValue: 0,
            availableToBorrow: 10,
            healthFactor: 999,
            balances: [{ asset: 'XLM', balance: 12.5 }],
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Malformed wallet address' })
  async getPortfolio(
    @Param('walletAddress') walletAddress: string,
  ): Promise<ServiceResponse<PortfolioData>> {
    return this.portfoliosService.getPortfolio(walletAddress);
  }
}

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('pool/stats')
  getPoolStats() {
    return {
      totalLiquidity: '1,234,567.89 USDC',
      totalBorrowed: '456,789.00 USDC',
      activeUsers: 128,
      privacyLevel: 'Maximum',
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/positions')
  getUserPositions(@Request() req) {
    // Return mock data for the user
    return {
      address: req.user.address,
      positions: [
        {
          id: '1',
          collateral: 'ETH',
          amount: '5.0',
          borrowed: '8000 USDC',
          healthFactor: 1.5,
          status: 'Healthy',
        },
        {
          id: '2',
          collateral: 'WBTC',
          amount: '0.1',
          borrowed: '3000 USDC',
          healthFactor: 1.2,
          status: 'Risk',
        },
      ],
    };
  }
}

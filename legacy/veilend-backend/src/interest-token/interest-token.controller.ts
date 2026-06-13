import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { InterestTokenService } from './interest-token.service';
import { MintDto, BurnDto, SetLiquidityDto } from './dto/interest-token.dto';

@Controller('interest-token')
export class InterestTokenController {
  constructor(private readonly svc: InterestTokenService) {}

  @Get('scaled-balance')
  async getScaledBalance(@Query('contract') contract: string, @Query('user') user: string) {
    return this.svc.getScaledBalance(contract, user);
  }

  @Post('mint')
  async mint(@Body() dto: MintDto) {
    return this.svc.mint(dto.contract, dto.to, dto.amount);
  }

  @Post('burn')
  async burn(@Body() dto: BurnDto) {
    return this.svc.burn(dto.contract, dto.from, dto.amount);
  }

  @Post('set-liquidity')
  async setLiquidity(@Body() dto: SetLiquidityDto) {
    return this.svc.setLiquidityIndex(dto.contract, dto.newIndex);
  }
}

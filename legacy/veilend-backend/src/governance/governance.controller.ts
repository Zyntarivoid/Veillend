import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { MintDto, BurnDto } from './dto/governance.dto';

@Controller('governance')
export class GovernanceController {
  constructor(private readonly svc: GovernanceService) {}

  @Get('total-supply')
  async totalSupply(@Query('contract') contract: string) {
    return this.svc.getTotalSupply(contract);
  }

  @Post('mint')
  async mint(@Body() dto: MintDto) {
    return this.svc.mint(dto.contract, dto.to, dto.amount);
  }

  @Post('burn')
  async burn(@Body() dto: BurnDto) {
    return this.svc.burn(dto.contract, dto.from, dto.amount);
  }
}

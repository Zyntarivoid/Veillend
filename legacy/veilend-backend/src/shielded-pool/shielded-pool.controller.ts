import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { ShieldedPoolService } from './shielded-pool.service';
import { DepositShieldedDto, WithdrawShieldedDto } from './dto/shielded-pool.dto';

@Controller('shielded-pool')
export class ShieldedPoolController {
  constructor(private readonly svc: ShieldedPoolService) {}

  @Get('commitment/:contractAddress/:commitment')
  async getCommitment(@Param('contractAddress') contractAddress: string, @Param('commitment') commitment: string) {
    return this.svc.getCommitment(contractAddress, commitment);
  }

  @Get('nullifier/:contractAddress/:nullifier')
  async isNullifierUsed(@Param('contractAddress') contractAddress: string, @Param('nullifier') nullifier: string) {
    return this.svc.isNullifierUsed(contractAddress, nullifier);
  }

  @Get('merkle-root')
  async getMerkleRoot(@Query('contractAddress') contractAddress: string) {
    return this.svc.getMerkleRoot(contractAddress);
  }

  @Post('deposit')
  async depositShielded(@Body() dto: DepositShieldedDto) {
    return this.svc.depositShielded(dto.contract, dto.commitment, dto.asset, dto.amount);
  }

  @Post('withdraw')
  async withdrawShielded(@Body() dto: WithdrawShieldedDto) {
    return this.svc.withdrawShielded(dto.contract, dto.nullifier, dto.recipient, dto.asset, dto.amount, dto.merkle_proof, dto.path_indices);
  }
}

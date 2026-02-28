import { Module } from '@nestjs/common';
import { InterestTokenController } from './interest-token.controller';
import { InterestTokenService } from './interest-token.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [InterestTokenController],
  providers: [InterestTokenService],
  exports: [InterestTokenService],
})
export class InterestTokenModule {}

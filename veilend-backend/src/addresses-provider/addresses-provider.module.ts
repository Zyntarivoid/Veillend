import { Module } from '@nestjs/common';
import { AddressesProviderController } from './addresses-provider.controller';
import { AddressesProviderService } from './addresses-provider.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [AddressesProviderController],
  providers: [AddressesProviderService],
  exports: [AddressesProviderService],
})
export class AddressesProviderModule {}

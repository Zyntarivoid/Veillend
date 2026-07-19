import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import stellarConfig from './stellar.config';
import { HorizonService } from './horizon.service';
import { SorobanRpcService } from './soroban-rpc.service';
import { StellarAccountService } from './stellar-account.service';

@Module({
  imports: [ConfigModule.forFeature(stellarConfig)],
  providers: [HorizonService, SorobanRpcService, StellarAccountService],
  exports: [HorizonService, SorobanRpcService, StellarAccountService],
})
export class StellarModule {}

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import stellarConfig from './stellar.config';
import { HorizonService } from './horizon.service';
import { SorobanRpcService } from './soroban-rpc.service';
import { StellarAccountService } from './stellar-account.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule, NestConfigModule.forFeature(stellarConfig)],
  providers: [HorizonService, SorobanRpcService, StellarAccountService],
  exports: [HorizonService, SorobanRpcService, StellarAccountService],
})
export class StellarModule {}

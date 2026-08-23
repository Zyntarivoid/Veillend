import { Module } from '@nestjs/common';
import { ProtocolController } from './protocol.controller';
import { ProtocolService } from './protocol.service';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { ProtocolChainReader } from './protocol-chain-reader';

@Module({
  imports: [ConfigModule, PrismaModule, StellarModule],
  controllers: [ProtocolController],
  providers: [ProtocolService, ProtocolChainReader],
  exports: [ProtocolService],
})
export class ProtocolModule {}

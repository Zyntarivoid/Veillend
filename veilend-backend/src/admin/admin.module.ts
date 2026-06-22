import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import indexerConfig from '../indexer/indexer.config';
import stellarConfig from '../stellar/stellar.config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    ConfigModule.forFeature(stellarConfig),
    ConfigModule.forFeature(indexerConfig),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

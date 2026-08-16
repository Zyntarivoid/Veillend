import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import indexerConfig from './indexer.config';
import { StellarModule } from '../stellar/stellar.module';
import { AuthModule } from '../auth/auth.module';
import { IndexerRepository } from './indexer.repository';
import { IndexerService } from './indexer.service';
import { IndexerController } from './indexer.controller';

@Module({
  imports: [ConfigModule.forFeature(indexerConfig), StellarModule, AuthModule],
  controllers: [IndexerController],
  providers: [IndexerRepository, IndexerService],
  exports: [IndexerService, IndexerRepository],
})
export class IndexerModule {}

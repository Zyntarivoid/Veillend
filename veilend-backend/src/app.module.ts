import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/env.validation';
import { RuntimeConfigModule } from './config/runtime-config.module';
import { RuntimeConfigService } from './config/runtime-config.service';
import { StellarModule } from './stellar/stellar.module';
import { IndexerModule } from './indexer/indexer.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { AssetsModule } from './assets/assets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    RuntimeConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RuntimeConfigModule],
      inject: [RuntimeConfigService],
      useFactory: (config: RuntimeConfigService) => [
        {
          ttl: config.throttleTtl,
          limit: config.throttleLimit,
        },
      ],
    }),
    StellarModule,
    IndexerModule,
    PortfoliosModule,
    AssetsModule,
    TransactionsModule,
    AdminModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

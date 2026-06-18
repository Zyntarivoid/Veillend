import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AssetsModule } from './assets/assets.module';
import { PositionsModule } from './positions/positions.module';
import { StarknetModule } from './starknet/starknet.module';
import { ShieldedPoolModule } from './shielded-pool/shielded-pool.module';
import { LendingPoolModule } from './lending-pool/lending-pool.module';
import { PriceOracleModule } from './price-oracle/price-oracle.module';
import { ReserveDataModule } from './reserve-data/reserve-data.module';
import { AddressesProviderModule } from './addresses-provider/addresses-provider.module';
import { InterestTokenModule } from './interest-token/interest-token.module';
import { GovernanceModule } from './governance/governance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    SupabaseModule,
    AuthModule,
    UsersModule,
    TransactionsModule,
    AssetsModule,
    PositionsModule,
    StarknetModule,
    ShieldedPoolModule,
    LendingPoolModule,
    PriceOracleModule,
    ReserveDataModule,
    AddressesProviderModule,
    InterestTokenModule,
    GovernanceModule,
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

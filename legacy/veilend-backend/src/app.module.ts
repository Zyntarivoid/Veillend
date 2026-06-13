import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    SupabaseModule,
    AuthModule,
    UsersModule,
    TransactionsModule,
    AssetsModule,
    PositionsModule
    ,StarknetModule,
    ShieldedPoolModule,
    LendingPoolModule,
    PriceOracleModule,
    ReserveDataModule,
    AddressesProviderModule,
    InterestTokenModule,
    GovernanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

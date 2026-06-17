import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    WalletModule,

    JwtModule.register({
      secret: 'SUPER_SECRET',

      signOptions: {
        expiresIn: '7d',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService],
})
export class AuthModule {}

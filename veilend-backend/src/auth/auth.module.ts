import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { RuntimeConfigModule } from '../config/runtime-config.module';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    WalletModule,
    RuntimeConfigModule,
    JwtModule.registerAsync({
      imports: [RuntimeConfigModule],
      inject: [RuntimeConfigService],
      useFactory: (config: RuntimeConfigService): JwtModuleOptions => ({
        secret: config.jwtSecret,
        signOptions: {
          expiresIn: config.jwtExpiresIn as NonNullable<
            JwtModuleOptions['signOptions']
          >['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

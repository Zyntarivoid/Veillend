import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { WalletModule } from 'src/wallet/wallet.module';
import { RuntimeConfigModule } from '../config/runtime-config.module';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    WalletModule,
    RuntimeConfigModule,
    JwtModule.registerAsync({
      imports: [RuntimeConfigModule],
      inject: [RuntimeConfigService],
      useFactory: (runtimeConfig: RuntimeConfigService): JwtModuleOptions => {
        const authConfig = runtimeConfig.getAuthConfig();
        return {
          secret: authConfig.jwtSecret,
          signOptions: {
            expiresIn: authConfig.jwtExpiresIn as NonNullable<
              JwtModuleOptions['signOptions']
            >['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

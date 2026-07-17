import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { JwtStrategy } from '../auth/jwt.strategy';

@Module({
  imports: [PassportModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, JwtStrategy],
})
export class TransactionsModule {}

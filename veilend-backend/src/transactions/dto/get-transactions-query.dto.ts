import { IsEnum, IsOptional } from 'class-validator';
import { TransactionType } from '@prisma/client';
import { PageOptionsDto } from '../../common/dto/page-options.dto';

export class GetTransactionsQueryDto extends PageOptionsDto {
  @IsEnum(TransactionType)
  @IsOptional()
  readonly type?: TransactionType;
}

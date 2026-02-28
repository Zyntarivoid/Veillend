import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class DepositDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsOptional()
  onBehalfOf?: string;
}

export class WithdrawDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsOptional()
  to?: string;
}

export class BorrowDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @Type(() => Number)
  interestRateMode: number;

  @IsString()
  @IsOptional()
  onBehalfOf?: string;
}

export class RepayDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @Type(() => Number)
  interestRateMode: number;

  @IsString()
  @IsOptional()
  onBehalfOf?: string;
}

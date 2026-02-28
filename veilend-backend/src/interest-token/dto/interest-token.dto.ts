import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class MintDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class BurnDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class SetLiquidityDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsNumber()
  @Type(() => Number)
  newIndex: number;
}

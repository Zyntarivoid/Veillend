import { IsString, IsNotEmpty, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class SetPriceDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  price: number;
}

export class SetPricesDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsArray()
  assets: string[];

  @IsArray()
  prices: number[];
}

export class SetPriceSourceDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsString()
  @IsNotEmpty()
  source: string;
}

export class SetStalenessDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsNumber()
  @Type(() => Number)
  newThreshold: number;
}

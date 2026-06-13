import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class SetReserveConfigDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  // config is free-form JSON; validate shallowly
  @IsOptional()
  config?: any;
}

export class SetReserveStateDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsOptional()
  state?: any;
}

export class SetUserReserveDataDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  user: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsOptional()
  data?: any;
}

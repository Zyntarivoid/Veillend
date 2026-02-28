import { IsNotEmpty, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class DepositShieldedDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  commitment: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class WithdrawShieldedDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  nullifier: string;

  @IsString()
  @IsNotEmpty()
  recipient: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsArray()
  merkle_proof: any[];

  @IsArray()
  path_indices: any[];
}

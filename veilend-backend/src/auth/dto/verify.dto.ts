import { IsArray, IsNotEmpty, IsString, IsObject } from 'class-validator';

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsArray()
  @IsNotEmpty()
  signature: string[];

  @IsObject()
  @IsNotEmpty()
  typedData: any;

  @IsString()
  @IsNotEmpty()
  publicKey: string;
}

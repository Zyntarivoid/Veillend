import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsArray()
  @IsNotEmpty()
  signature: string[];

  @IsObject()
  @IsNotEmpty()
  typedData: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  publicKey: string;
}

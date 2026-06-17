import { IsString } from 'class-validator';

export class VerifyWalletDto {
  @IsString()
  walletAddress: string;

  @IsString()
  signature: string;

  @IsString()
  nonce: string;
}

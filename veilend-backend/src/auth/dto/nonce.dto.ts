import { IsString } from 'class-validator';

export class NonceDto {
  @IsString()
  walletAddress: string;
}

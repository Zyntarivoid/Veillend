import { IsString } from 'class-validator';

export class AddAdminDto {
  @IsString()
  walletAddress: string;
}

import { IsString, IsBase64, Length, IsHexadecimal } from 'class-validator';
import { IsStellarAddress } from '../../common/validators/is-stellar-address.validator';

export class VerifyWalletDto {
  @IsStellarAddress()
  walletAddress: string;

  @IsString()
  @IsBase64()
  @Length(88, 88)
  signature: string;

  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  nonce: string;
}

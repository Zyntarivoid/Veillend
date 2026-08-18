import { IsStellarAddress } from '../../common/validators/is-stellar-address.validator';

export class NonceDto {
  @IsStellarAddress()
  walletAddress: string;
}

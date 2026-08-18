import { IsStellarAddress } from '../../common/validators/is-stellar-address.validator';

export class AddAdminDto {
  @IsStellarAddress()
  walletAddress: string;
}

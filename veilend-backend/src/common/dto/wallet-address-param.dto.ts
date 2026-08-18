import { IsStellarAddress } from '../validators/is-stellar-address.validator';

// Nest's ValidationPipe skips primitive-typed @Param() values, so route
// params must be typed as a class like this one to get validated.
export class WalletAddressParamDto {
  @IsStellarAddress()
  walletAddress: string;
}

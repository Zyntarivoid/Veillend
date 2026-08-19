import { IsStellarAddress } from '../../common/validators/is-stellar-address.validator';

// Nest's ValidationPipe skips primitive-typed @Param() values, so the
// `:address` route param must be typed as a class like this one to get
// validated (and to reject non-Stellar-address input, including anything
// crafted for log injection, before it ever reaches a handler).
export class AddressParamDto {
  @IsStellarAddress()
  address: string;
}

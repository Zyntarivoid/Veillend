import { IsString, IsNotEmpty } from 'class-validator';

export class SetAddressDto {
  @IsString()
  @IsNotEmpty()
  contract: string;

  @IsString()
  @IsNotEmpty()
  newAddress: string;
}

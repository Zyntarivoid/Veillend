import { IsString, IsInt, Min } from 'class-validator';

export class SetOraclePriceDto {
  @IsString()
  assetContractId: string;

  @IsInt()
  @Min(1)
  price: number;
}

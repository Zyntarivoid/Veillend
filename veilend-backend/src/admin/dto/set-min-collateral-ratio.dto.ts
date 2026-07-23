import { IsInt, Min } from 'class-validator';

export class SetMinCollateralRatioDto {
  @IsInt()
  @Min(10000)
  minCollateralRatioBps: number;
}

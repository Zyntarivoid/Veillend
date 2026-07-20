import { IsString, IsBoolean } from 'class-validator';

export class ConfigureAssetDto {
  @IsString()
  assetContractId: string;

  @IsBoolean()
  supported: boolean;
}

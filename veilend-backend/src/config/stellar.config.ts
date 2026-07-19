import { IsOptional, IsString, IsUrl } from 'class-validator';

export class StellarConfig {
  @IsOptional()
  @IsString()
  STELLAR_NETWORK: string = 'testnet';

  @IsOptional()
  @IsUrl()
  STELLAR_HORIZON_URL: string = 'https://horizon-testnet.stellar.org';

  @IsOptional()
  @IsUrl()
  STELLAR_SOROBAN_RPC_URL: string = 'https://soroban-testnet.stellar.org';

  @IsOptional()
  @IsString()
  STELLAR_NETWORK_PASSPHRASE: string =
    'Test SDF Network ; September 2015';
}

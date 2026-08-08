import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyWalletDto {
  @ApiProperty({
    description: 'Stellar account public key (G…)',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @IsString()
  walletAddress: string;

  @ApiProperty({
    description: 'Base64 or hex wallet signature over the nonce',
    example: 'AAAAAg…',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'Nonce previously issued by POST /auth/nonce',
    example: 'veilend-login:G…:1710000000:abc',
  })
  @IsString()
  nonce: string;
}

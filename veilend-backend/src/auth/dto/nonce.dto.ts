import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class NonceDto {
  @ApiProperty({
    description: 'Stellar account public key (G…)',
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @IsString()
  walletAddress: string;
}

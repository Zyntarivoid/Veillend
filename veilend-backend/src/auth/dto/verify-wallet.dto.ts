import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyWalletDto {
  @ApiProperty({
    description: 'Wallet address that received the nonce.',
    example: 'GABCD3Y2Y7Q7N4W7H5H4S3V2K6P5JQ2Q4A5W6X7Y8Z9EXAMPLE',
  })
  @IsString()
  walletAddress: string;

  @ApiProperty({
    description: 'Signature over the issued nonce.',
    example: 'MEUCIQD7example-signature-fragment...',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'One-time nonce returned by POST /v1/auth/nonce.',
    example: '6e165df1-2bd7-4f63-947c-d9b5f5e6a2bb',
  })
  @IsString()
  nonce: string;
}

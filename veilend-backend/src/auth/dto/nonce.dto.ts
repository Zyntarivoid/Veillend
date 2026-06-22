import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class NonceDto {
  @ApiProperty({
    description: 'Wallet address requesting a one-time authentication nonce.',
    example: 'GABCD3Y2Y7Q7N4W7H5H4S3V2K6P5JQ2Q4A5W6X7Y8Z9EXAMPLE',
  })
  @IsString()
  walletAddress: string;
}

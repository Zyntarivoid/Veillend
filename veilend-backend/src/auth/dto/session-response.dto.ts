import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' })
  walletAddress: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  sessionId: string;

  @ApiProperty({
    description: 'ISO-8601 expiry of the server-side session',
    example: '2026-08-09T12:00:00.000Z',
  })
  expiresAt: string;
}

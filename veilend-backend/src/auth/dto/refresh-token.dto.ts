import { IsString, IsHexadecimal, Length } from 'class-validator';

// Opaque refresh token: crypto.randomBytes(64) hex-encoded -> 128 hex chars.
export class RefreshTokenDto {
  @IsString()
  @IsHexadecimal()
  @Length(128, 128)
  refreshToken: string;
}

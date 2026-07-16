import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating user profile information.
 * All fields are optional - only provided fields will be updated.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Public display name (3-50 characters)',
    example: 'Alice DeFi',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Short bio (max 500 characters)',
    example: 'DeFi enthusiast and yield farmer',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://example.com/avatar.png',
  })
  @IsUrl()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Contact email address',
    example: 'alice@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'User location',
    example: 'San Francisco, CA',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({
    description: 'Personal website URL',
    example: 'https://alice.dev',
  })
  @IsUrl()
  @IsOptional()
  website?: string;
}

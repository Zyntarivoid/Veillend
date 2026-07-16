import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating user privacy preferences.
 * All fields are optional - only provided fields will be updated.
 */
export class UpdatePrivacyDto {
  @ApiPropertyOptional({
    description: 'Show positions publicly',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  showPositions?: boolean;

  @ApiPropertyOptional({
    description: 'Show transaction history publicly',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  showTransactions?: boolean;

  @ApiPropertyOptional({
    description: 'Show portfolio value publicly',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  showPortfolio?: boolean;

  @ApiPropertyOptional({
    description: 'Profile visibility setting',
    enum: ['public', 'private', 'followers'],
    example: 'public',
    default: 'public',
  })
  @IsString()
  @IsOptional()
  @IsIn(['public', 'private', 'followers'])
  profileVisibility?: string;
}

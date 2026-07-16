import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Privacy preferences in the profile response.
 */
export class PrivacyPreferencesDto {
  @ApiProperty({ description: 'Show positions publicly' })
  showPositions: boolean;

  @ApiProperty({ description: 'Show transaction history publicly' })
  showTransactions: boolean;

  @ApiProperty({ description: 'Show portfolio value publicly' })
  showPortfolio: boolean;

  @ApiProperty({ description: 'Profile visibility setting' })
  profileVisibility: string;
}

/**
 * Full profile response returned by the API.
 */
export class ProfileResponseDto {
  @ApiProperty({ description: 'User UUID' })
  id: string;

  @ApiProperty({ description: 'Stellar wallet address' })
  walletAddress: string;

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Public display name' })
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'Short bio' })
  bio?: string | null;

  @ApiPropertyOptional({ description: 'Avatar image URL' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: 'Contact email' })
  email?: string | null;

  @ApiPropertyOptional({ description: 'User location' })
  location?: string | null;

  @ApiPropertyOptional({ description: 'Personal website URL' })
  website?: string | null;

  @ApiProperty({ description: 'Privacy preferences', type: PrivacyPreferencesDto })
  privacy: PrivacyPreferencesDto;
}

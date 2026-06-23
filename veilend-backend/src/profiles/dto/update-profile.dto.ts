import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateProfileSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  locale?: string;

  @IsOptional()
  @IsIn(['system', 'light', 'dark'])
  theme?: 'system' | 'light' | 'dark';

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

export class UpdatePrivacyPreferencesDto {
  @IsOptional()
  @IsBoolean()
  showPortfolioValue?: boolean;

  @IsOptional()
  @IsBoolean()
  showTransactionHistory?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAnalytics?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  bio?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateProfileSettingsDto)
  settings?: UpdateProfileSettingsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePrivacyPreferencesDto)
  privacy?: UpdatePrivacyPreferencesDto;
}

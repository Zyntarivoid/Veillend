import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PrivacyPreferencesDto {
  @IsOptional()
  @IsBoolean()
  hideBalances?: boolean;

  @IsOptional()
  @IsBoolean()
  hideActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePrivacyMode?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PrivacyPreferencesDto)
  privacy?: PrivacyPreferencesDto;
}

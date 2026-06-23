import type {
  PrivacyPreferences,
  ProfileSettings,
  UserProfile,
} from '../profiles.types';

export class ProfileResponseDto implements UserProfile {
  walletAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  settings: ProfileSettings;
  privacy: PrivacyPreferences;
  updatedAt: string;
}

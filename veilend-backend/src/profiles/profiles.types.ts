export type ProfileTheme = 'system' | 'light' | 'dark';

export interface ProfileSettings {
  locale: string;
  theme: ProfileTheme;
  emailNotifications: boolean;
}

export interface PrivacyPreferences {
  showPortfolioValue: boolean;
  showTransactionHistory: boolean;
  allowAnalytics: boolean;
}

export interface UserProfile {
  walletAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  settings: ProfileSettings;
  privacy: PrivacyPreferences;
  updatedAt: string;
}

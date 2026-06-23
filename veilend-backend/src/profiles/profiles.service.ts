import { Injectable } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { UserProfile } from './profiles.types';

const DEFAULT_SETTINGS = {
  locale: 'en-US',
  theme: 'system' as const,
  emailNotifications: false,
};

const DEFAULT_PRIVACY = {
  showPortfolioValue: false,
  showTransactionHistory: false,
  allowAnalytics: false,
};

@Injectable()
export class ProfilesService {
  private readonly profiles = new Map<string, UserProfile>();

  getProfile(walletAddress: string): UserProfile {
    const existing = this.profiles.get(walletAddress);

    if (existing) {
      return existing;
    }

    const created: UserProfile = {
      walletAddress,
      username: null,
      displayName: null,
      bio: null,
      settings: { ...DEFAULT_SETTINGS },
      privacy: { ...DEFAULT_PRIVACY },
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(walletAddress, created);
    return created;
  }

  updateProfile(walletAddress: string, dto: UpdateProfileDto): UserProfile {
    const current = this.getProfile(walletAddress);
    const updated: UserProfile = {
      ...current,
      username: dto.username ?? current.username,
      displayName: dto.displayName ?? current.displayName,
      bio: dto.bio ?? current.bio,
      settings: {
        ...current.settings,
        ...dto.settings,
      },
      privacy: {
        ...current.privacy,
        ...dto.privacy,
      },
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(walletAddress, updated);
    return updated;
  }
}

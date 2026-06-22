import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface PrivacyPreferences {
  hideBalances: boolean;
  hideActivity: boolean;
  requirePrivacyMode: boolean;
}

export interface UserProfile {
  walletAddress: string;
  username: string | null;
  displayName: string | null;
  privacy: PrivacyPreferences;
  updatedAt: string | null;
}

const DEFAULT_PRIVACY: PrivacyPreferences = {
  hideBalances: false,
  hideActivity: false,
  requirePrivacyMode: false,
};

@Injectable()
export class ProfilesService {
  private readonly profiles = new Map<string, UserProfile>();

  getProfile(walletAddress: string): UserProfile {
    this.assertWalletAddress(walletAddress);

    return this.cloneProfile(
      this.profiles.get(walletAddress) ??
        this.createDefaultProfile(walletAddress),
    );
  }

  updateProfile(walletAddress: string, updates: UpdateProfileDto): UserProfile {
    this.assertWalletAddress(walletAddress);

    const current =
      this.profiles.get(walletAddress) ??
      this.createDefaultProfile(walletAddress);
    const next: UserProfile = {
      ...current,
      username: updates.username ?? current.username,
      displayName: updates.displayName ?? current.displayName,
      privacy: {
        ...current.privacy,
        ...updates.privacy,
      },
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(walletAddress, next);

    return this.cloneProfile(next);
  }

  private createDefaultProfile(walletAddress: string): UserProfile {
    return {
      walletAddress,
      username: null,
      displayName: null,
      privacy: { ...DEFAULT_PRIVACY },
      updatedAt: null,
    };
  }

  private cloneProfile(profile: UserProfile): UserProfile {
    return {
      ...profile,
      privacy: { ...profile.privacy },
    };
  }

  private assertWalletAddress(walletAddress: string) {
    if (!walletAddress || walletAddress.trim().length < 8) {
      throw new BadRequestException(
        'walletAddress must be a non-empty wallet id',
      );
    }
  }
}

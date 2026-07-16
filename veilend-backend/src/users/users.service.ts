import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Map a User entity to ProfileResponseDto.
   */
  private toProfileResponse(user: {
    id: string;
    walletAddress: string;
    createdAt: Date;
    updatedAt: Date;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    email: string | null;
    location: string | null;
    website: string | null;
    showPositions: boolean;
    showTransactions: boolean;
    showPortfolio: boolean;
    profileVisibility: string;
  }): ProfileResponseDto {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      email: user.email,
      location: user.location,
      website: user.website,
      privacy: {
        showPositions: user.showPositions,
        showTransactions: user.showTransactions,
        showPortfolio: user.showPortfolio,
        profileVisibility: user.profileVisibility,
      },
    };
  }

  /**
   * Get profile for the authenticated user.
   */
  async getProfile(walletAddress: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toProfileResponse(user);
  }

  /**
   * Update profile fields for the authenticated user.
   */
  async updateProfile(
    walletAddress: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    // Ensure user exists
    const existing = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Only update fields that are provided
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.website !== undefined) data.website = dto.website;

    const user = await this.prisma.user.update({
      where: { walletAddress },
      data,
    });

    return this.toProfileResponse(user);
  }

  /**
   * Update privacy preferences for the authenticated user.
   */
  async updatePrivacy(
    walletAddress: string,
    dto: UpdatePrivacyDto,
  ): Promise<ProfileResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.showPositions !== undefined) data.showPositions = dto.showPositions;
    if (dto.showTransactions !== undefined)
      data.showTransactions = dto.showTransactions;
    if (dto.showPortfolio !== undefined) data.showPortfolio = dto.showPortfolio;
    if (dto.profileVisibility !== undefined)
      data.profileVisibility = dto.profileVisibility;

    const user = await this.prisma.user.update({
      where: { walletAddress },
      data,
    });

    return this.toProfileResponse(user);
  }
}

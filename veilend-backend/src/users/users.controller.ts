import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

/**
 * Controller for user profile and account settings management.
 * All endpoints require JWT authentication.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/profile
   * Retrieve the authenticated user's profile.
   */
  @Get('profile')
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Retrieve the authenticated user\'s profile information including privacy preferences.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(@Req() req: any): Promise<ApiResponseDto<ProfileResponseDto>> {
    const profile = await this.usersService.getProfile(req.user.walletAddress);
    return ApiResponseDto.success(profile);
  }

  /**
   * PUT /users/profile
   * Update the authenticated user's profile fields.
   */
  @Put('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Update profile fields (displayName, bio, avatarUrl, email, location, website). Only provided fields are updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponseDto<ProfileResponseDto>> {
    const profile = await this.usersService.updateProfile(
      req.user.walletAddress,
      dto,
    );
    return ApiResponseDto.success(profile);
  }

  /**
   * PUT /users/privacy
   * Update the authenticated user's privacy preferences.
   */
  @Put('privacy')
  @ApiOperation({
    summary: 'Update privacy preferences',
    description: 'Update privacy settings (showPositions, showTransactions, showPortfolio, profileVisibility). Only provided fields are updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Privacy preferences updated successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updatePrivacy(
    @Req() req: any,
    @Body() dto: UpdatePrivacyDto,
  ): Promise<ApiResponseDto<ProfileResponseDto>> {
    const profile = await this.usersService.updatePrivacy(
      req.user.walletAddress,
      dto,
    );
    return ApiResponseDto.success(profile);
  }
}

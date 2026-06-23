import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':walletAddress')
  readProfile(
    @Param('walletAddress') walletAddress: string,
  ): ProfileResponseDto {
    return this.profilesService.getProfile(walletAddress);
  }

  @Patch(':walletAddress')
  updateProfile(
    @Param('walletAddress') walletAddress: string,
    @Body() dto: UpdateProfileDto,
  ): ProfileResponseDto {
    return this.profilesService.updateProfile(walletAddress, dto);
  }
}

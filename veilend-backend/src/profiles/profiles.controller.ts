import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
@UsePipes(
  new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  }),
)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':walletAddress')
  getProfile(@Param('walletAddress') walletAddress: string) {
    return this.profilesService.getProfile(walletAddress);
  }

  @Patch(':walletAddress')
  updateProfile(
    @Param('walletAddress') walletAddress: string,
    @Body() updates: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(walletAddress, updates);
  }
}

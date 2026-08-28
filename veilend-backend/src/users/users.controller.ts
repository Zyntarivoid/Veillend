import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { CreatePushTokenDto } from './dto/create-push-token.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { SetE2eeKeyDto } from './dto/set-e2ee-key.dto';
import { PushTokenResponseDto } from './dto/push-token-response.dto';
import { NotificationSettingsResponseDto } from './dto/notification-settings-response.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('me/push-tokens')
  async registerPushToken(
    @Body() dto: CreatePushTokenDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PushTokenResponseDto> {
    return this.usersService.upsertPushToken(this.requireUserId(req), dto);
  }

  @Post('me/push-token')
  async registerPushTokenSingular(
    @Body() dto: CreatePushTokenDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PushTokenResponseDto> {
    return this.usersService.upsertPushToken(this.requireUserId(req), dto);
  }

  @Delete('me/push-tokens/:id')
  async removePushToken(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deleted: true }> {
    await this.usersService.deletePushToken(this.requireUserId(req), id);
    return { deleted: true };
  }

  @Get('me/notifications/settings')
  async getNotificationSettings(
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationSettingsResponseDto> {
    return this.usersService.getNotificationSettings(this.requireUserId(req));
  }

  @Patch('me/notifications/settings')
  async updateNotificationSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationSettingsResponseDto> {
    return this.usersService.updateNotificationSettings(
      this.requireUserId(req),
      dto,
    );
  }

  @Post('me/e2ee-key')
  async setE2eeKey(
    @Body() dto: SetE2eeKeyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ updatedAt: Date }> {
    return this.usersService.setE2eeKey(this.requireUserId(req), dto.publicKey);
  }

  private requireUserId(req: AuthenticatedRequest): string {
    if (!req.user.userId) {
      throw new UnauthorizedException('No user authenticated');
    }
    return req.user.userId;
  }
}

import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { LiquidationsService } from './liquidations.service';
import { WatchlistResponseDto } from './dto/watchlist-response.dto';

@Controller('liquidations')
@UseGuards(JwtAuthGuard)
export class LiquidationsController {
  constructor(private readonly liquidationsService: LiquidationsService) {}

  @Get('watchlist')
  @Throttle({ default: { limit: 1, ttl: 2000 } })
  getWatchlist(
    @Req() req: AuthenticatedRequest,
  ): Promise<WatchlistResponseDto> {
    if (!req.user.userId)
      throw new UnauthorizedException('No user authenticated');
    return this.liquidationsService.getWatchlist(req.user.userId);
  }
}

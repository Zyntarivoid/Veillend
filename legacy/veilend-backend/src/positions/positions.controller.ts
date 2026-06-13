import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('positions')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(private positionsService: PositionsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  @ApiOperation({ summary: 'Get user active positions' })
  findAll(@Request() req) {
    return this.positionsService.findAll(req.user.address);
  }
}

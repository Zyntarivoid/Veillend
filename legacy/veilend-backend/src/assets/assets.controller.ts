import { Controller, Get } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private assetsService: AssetsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of supported assets' })
  findAll() {
    return this.assetsService.findAll();
  }
}

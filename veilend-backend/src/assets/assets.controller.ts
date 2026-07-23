import {
  Controller,
  Get,
  Param,
  Query,
  Header,
  NotFoundException,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetResponseDto } from './dto/asset-response.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

/** Cache-Control max-age for asset endpoints (in seconds) */
const ASSET_CACHE_MAX_AGE = 60;

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /**
   * GET /assets
   * Returns all registered assets. Pass ?supported=true to filter to configured assets only.
   */
  @Get()
  @Header('cache-control', `public, max-age=${ASSET_CACHE_MAX_AGE}`)
  async findAll(
    @Query('supported') supported?: string,
  ): Promise<ApiResponseDto<AssetResponseDto[]>> {
    const assets =
      supported === 'true'
        ? await this.assetsService.findSupported()
        : await this.assetsService.findAll();

    return ApiResponseDto.success(assets, {
      count: assets.length,
      cached: true,
      cacheMaxAge: ASSET_CACHE_MAX_AGE,
    });
  }

  /**
   * GET /assets/:id
   * Returns a single asset by UUID, code (e.g. "USDC"), or contractId.
   */
  @Get(':id')
  @Header('cache-control', `public, max-age=${ASSET_CACHE_MAX_AGE}`)
  async findOne(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<AssetResponseDto>> {
    try {
      const asset = await this.assetsService.findOne(id);
      return ApiResponseDto.success(asset);
    } catch {
      throw new NotFoundException(`Asset not found: ${id}`);
    }
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProtocolService } from './protocol.service';
import { ProtocolConfigResponseDto } from './dto/protocol-config-response.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

/** Cache-Control max-age for protocol config (in seconds) */
const CONFIG_CACHE_MAX_AGE = 120;

@ApiTags('protocol')
@Controller('protocol')
export class ProtocolController {
  constructor(private readonly protocolService: ProtocolService) {}

  /**
   * GET /protocol/config
   * Returns the full protocol configuration including:
   * - Network settings (Stellar network, RPC endpoints, contract address)
   * - Risk parameters (collateral factors, liquidation thresholds, close factor)
   * - Per-asset risk configuration
   *
   * Public endpoint – no authentication required.
   * Responses include Cache-Control headers for CDN/browser caching.
   */
  @Get('config')
  @Header('cache-control', `public, max-age=${CONFIG_CACHE_MAX_AGE}`)
  @ApiOperation({ summary: 'Get protocol configuration and risk parameters' })
  @ApiOkResponse({
    description: 'Wrapped protocol config',
    schema: {
      example: {
        success: true,
        data: {
          network: { network: 'testnet', contractId: 'C…' },
          risk: { minCollateralRatioBps: 15000 },
        },
        meta: { cacheMaxAge: 120 },
      },
    },
  })
  async getConfig(): Promise<ApiResponseDto<ProtocolConfigResponseDto>> {
    const config = await this.protocolService.getConfig();
    return ApiResponseDto.success(config, {
      cacheMaxAge: CONFIG_CACHE_MAX_AGE,
    });
  }
}

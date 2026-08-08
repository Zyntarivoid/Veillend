import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { AppConfigService } from './config/app-config.service';
import { API_MAJOR_VERSION } from './common/interceptors/api-version.interceptor';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service greeting' })
  @ApiOkResponse({
    schema: { type: 'string', example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Process-up check for load balancers and CI. Does not verify database readiness.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
          network: 'testnet',
          apiVersion: '1',
          timestamp: 1710000000000,
        },
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      network: this.configService.stellar.network,
      apiVersion: API_MAJOR_VERSION,
      timestamp: Date.now(),
    };
  }
}

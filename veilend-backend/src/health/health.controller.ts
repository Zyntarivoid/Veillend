import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('ready')
  async getReadiness() {
    const readiness = await this.healthService.getReadiness();
    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }

  @Get('version')
  getVersion() {
    return this.healthService.getVersion();
  }
}

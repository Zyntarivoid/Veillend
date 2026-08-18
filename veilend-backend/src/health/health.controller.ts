import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async getHealth() {
    const result = await this.healthService.check();

    const allDown =
      result.components.prisma.status === 'down' &&
      result.components.sorobanRpc.status === 'down' &&
      result.components.horizon.status === 'down';

    if (allDown) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }

  @Get('ready')
  async getReady() {
    const ready = await this.healthService.isPrismaReady();
    if (!ready) {
      throw new HttpException(
        { status: 'not ready', reason: 'database unavailable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ready' };
  }
}

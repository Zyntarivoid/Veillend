import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service';
import type {
  HealthResponse,
  ReadinessResponse,
  VersionResponse,
} from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  getReadiness(): ReadinessResponse {
    const readiness = this.appService.getReadiness();
    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }
    return readiness;
  }

  @Get('version')
  @HttpCode(HttpStatus.OK)
  getVersion(): VersionResponse {
    return this.appService.getVersion();
  }
}

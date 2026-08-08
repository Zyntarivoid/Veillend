import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness: process is up (no dependency checks). */
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  /**
   * Readiness: dependencies (database, config) must be healthy.
   * Returns HTTP 503 when any required check fails so orchestrators
   * can pull traffic until deps recover.
   */
  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response) {
    const body = await this.appService.getReady();
    if (body.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  /** Version / commit for deploy debugging. */
  @Get('version')
  getVersion() {
    return this.appService.getVersion();
  }
}

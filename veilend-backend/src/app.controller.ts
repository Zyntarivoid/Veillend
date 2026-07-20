import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { AppConfigService } from './config/app-config.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: AppConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      network: this.configService.stellar.network,
      timestamp: Date.now(),
    };
  }
}

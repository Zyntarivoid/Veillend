import { Controller, Get, Header } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('protocol')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=60')
  getProtocolConfig() {
    return this.adminService.getProtocolConfig();
  }

  @Get('risk')
  @Header('Cache-Control', 'public, max-age=60')
  getRiskConfig() {
    return this.adminService.getRiskConfig();
  }
}

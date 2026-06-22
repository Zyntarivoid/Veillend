import { Global, Module } from '@nestjs/common';
import { RuntimeConfigService } from './runtime-config.service';

@Global()
@Module({
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

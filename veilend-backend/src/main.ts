import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RuntimeConfigService } from './config/runtime-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const runtimeConfig = app.get(RuntimeConfigService);
  await app.listen(runtimeConfig.port);
}
void bootstrap();

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateConfig, redactConfig } from './validation';
import { AppConfig } from './app.config';
import { IndexerConfig } from './indexer.config';
import { AuthConfig } from './auth.config';
import { AppConfigService } from './app-config.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigModule');

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config) => {
        logger.log('Validating application configuration...');

        const validatedAppConfig = validateConfig(config, AppConfig);
        const validatedIndexerConfig = validateConfig(config, IndexerConfig);
        const validatedAuthConfig = validateConfig(config, AuthConfig);

        const mergedConfig = {
          ...validatedAppConfig,
          ...validatedIndexerConfig,
          ...validatedAuthConfig,
        };

        logger.log('Configuration validated successfully!');
        logger.log('Loaded configuration:', redactConfig(mergedConfig));

        return mergedConfig;
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}

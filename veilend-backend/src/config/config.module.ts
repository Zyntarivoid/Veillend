import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateConfig, redactConfig } from './validation';
import { AppConfig } from './app.config';
import { IndexerConfig } from './indexer.config';
import { AuthConfig } from './auth.config';
import { AdminConfig } from './admin.config';
import { NotificationsConfig } from './notifications.config';
import { RiskConfig } from './risk.config';
import { AppConfigService } from './app-config.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigModule');

/**
 * Validate that all required JWT environment variables are present in
 * production and that the unsafe `dev_secret` default is rejected.
 *
 * Called both from the ConfigModule validate callback (runs at import time
 * in production where env vars are already set) and from `main.ts` before
 * `NestFactory.create` (runs at startup, after env vars are guaranteed to
 * be in `process.env`).
 */
export function validateProductionJwtConfig(): void {
  if (process.env.NODE_ENV === 'production') {
    const requiredEnvVars = [
      'JWT_SECRET',
      'JWT_EXPIRES_IN',
      'JWT_ISSUER',
      'JWT_AUDIENCE',
    ];
    const missing = requiredEnvVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable(s) in production: ${missing.join(', ')}`,
      );
    }
    if (process.env.JWT_SECRET === 'dev_secret') {
      throw new Error('JWT_SECRET cannot be dev_secret in production');
    }
  }
}

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
        const validatedAdminConfig = validateConfig(config, AdminConfig);
        const validatedNotificationsConfig = validateConfig(
          config,
          NotificationsConfig,
        );
        const validatedRiskConfig = validateConfig(config, RiskConfig);

        const mergedConfig = {
          ...validatedAppConfig,
          ...validatedIndexerConfig,
          ...validatedAuthConfig,
          ...validatedAdminConfig,
          ...validatedNotificationsConfig,
          ...validatedRiskConfig,
        };

        validateProductionJwtConfig();

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

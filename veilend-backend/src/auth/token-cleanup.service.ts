import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AuthService } from './auth.service';

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Periodically prunes expired JtiRegistry and RefreshToken rows so those
 * tables don't grow unbounded (a long-lived session refreshed every 15
 * minutes for 30 days would otherwise leave thousands of jti rows behind).
 * Mirrors the polling-loop shape of AdminActionWatcherService.
 */
@Injectable()
export class TokenCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly authService: AuthService) {}

  onApplicationBootstrap() {
    this.schedule();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private schedule() {
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.schedule());
    }, CLEANUP_INTERVAL_MS);
  }

  async run(): Promise<void> {
    try {
      const { jtiDeleted, refreshTokensDeleted } =
        await this.authService.cleanupExpiredTokens();

      if (jtiDeleted > 0 || refreshTokensDeleted > 0) {
        this.logger.log(
          `Pruned ${jtiDeleted} expired jti(s) and ${refreshTokensDeleted} expired refresh token(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Expired token cleanup failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

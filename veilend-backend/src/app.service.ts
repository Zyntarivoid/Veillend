import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { AppConfigService } from './config/app-config.service';

export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

export interface ReadyResponse {
  status: HealthStatus;
  checks: DependencyCheck[];
  timestamp: number;
}

export interface VersionResponse {
  name: string;
  version: string;
  commit: string | null;
  nodeEnv: string;
  network: string;
}

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok' as const,
      network: this.config.stellar.network,
      timestamp: Date.now(),
    };
  }

  async getReady(): Promise<ReadyResponse> {
    const checks: DependencyCheck[] = [];

    // Database (Prisma) — required for readiness
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({
        name: 'database',
        status: 'ok',
        latencyMs: Date.now() - dbStart,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.push({
        name: 'database',
        status: 'error',
        latencyMs: Date.now() - dbStart,
        error: message,
      });
    }

    // Stellar network config present (no live RPC ping — keeps ready cheap)
    const hasHorizon = Boolean(this.config.stellar.horizonUrl);
    checks.push({
      name: 'stellar_config',
      status: hasHorizon ? 'ok' : 'error',
      error: hasHorizon ? undefined : 'horizon URL not configured',
    });

    const status: HealthStatus = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'degraded')
        ? 'degraded'
        : 'ok';

    return {
      status,
      checks,
      timestamp: Date.now(),
    };
  }

  getVersion(): VersionResponse {
    const pkgVersion =
      process.env.npm_package_version ||
      process.env.APP_VERSION ||
      '0.0.0';
    const commit =
      process.env.GIT_COMMIT ||
      process.env.GITHUB_SHA ||
      process.env.COMMIT_SHA ||
      null;

    return {
      name: 'veilend-backend',
      version: pkgVersion,
      commit,
      nodeEnv: process.env.NODE_ENV || 'development',
      network: this.config.stellar.network,
    };
  }
}

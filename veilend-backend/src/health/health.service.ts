import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';

const DEFAULT_READINESS_TIMEOUT_MS = 2000;

type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface DependencyHealth {
  status: DependencyStatus;
  checkedAt: string;
  message?: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: string;
  timestamp: string;
  dependencies: {
    sorobanRpc: DependencyHealth;
  };
}

export interface VersionResponse {
  service: string;
  version: string;
  commit: string;
  ref: string;
  environment: string;
}

@Injectable()
export class HealthService {
  private readonly serviceName = 'veilend-backend';
  private readonly packageVersion = this.readPackageVersion();

  constructor(private readonly sorobanRpcService: SorobanRpcService) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const sorobanRpc = await this.checkSorobanRpc();
    const status = sorobanRpc.status === 'up' ? 'ready' : 'not_ready';

    return {
      status,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      dependencies: {
        sorobanRpc,
      },
    };
  }

  getVersion(): VersionResponse {
    return {
      service: this.serviceName,
      version: this.packageVersion,
      commit: this.firstSetEnv([
        'GIT_SHA',
        'VERCEL_GIT_COMMIT_SHA',
        'COMMIT_SHA',
        'GITHUB_SHA',
      ]),
      ref: this.firstSetEnv([
        'GIT_REF',
        'VERCEL_GIT_COMMIT_REF',
        'GITHUB_REF_NAME',
        'GITHUB_REF',
      ]),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  private async checkSorobanRpc(): Promise<DependencyHealth> {
    const checkedAt = new Date().toISOString();

    try {
      const connected = await this.withTimeout(
        this.sorobanRpcService.validateConnection(),
        this.readinessTimeoutMs(),
      );

      if (connected) {
        return {
          status: 'up',
          checkedAt,
        };
      }

      return {
        status: 'down',
        checkedAt,
        message:
          this.sorobanRpcService.getLastError() ||
          'Soroban RPC health check failed',
      };
    } catch (error) {
      return {
        status: 'down',
        checkedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            reject(
              new Error(`Dependency check timed out after ${timeoutMs}ms`),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private readinessTimeoutMs(): number {
    const configured = Number(process.env.READINESS_RPC_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }

    return DEFAULT_READINESS_TIMEOUT_MS;
  }

  private firstSetEnv(keys: string[]): string {
    for (const key of keys) {
      const value = process.env[key];
      if (value) {
        return value;
      }
    }

    return 'unknown';
  }

  private readPackageVersion(): string {
    if (process.env.npm_package_version) {
      return process.env.npm_package_version;
    }

    try {
      const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      ) as { version?: string };
      return packageJson.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}

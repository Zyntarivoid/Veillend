import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface DependencyReadiness {
  status: 'up' | 'down';
  reason?: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  dependencies: {
    horizon: DependencyReadiness;
    sorobanRpc: DependencyReadiness;
    networkPassphrase: DependencyReadiness;
  };
}

export interface VersionResponse {
  service: string;
  version: string;
  commit: string;
  environment: string;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'veilend-backend',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessResponse {
    const dependencies = {
      horizon: this.validateUrl(
        env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
        'STELLAR_HORIZON_URL',
      ),
      sorobanRpc: this.validateUrl(
        env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
        'STELLAR_SOROBAN_RPC_URL',
      ),
      networkPassphrase: this.validateRequired(
        env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
        'STELLAR_NETWORK_PASSPHRASE',
      ),
    };

    const ready = Object.values(dependencies).every(
      (dependency) => dependency.status === 'up',
    );

    return {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  getVersion(env: NodeJS.ProcessEnv = process.env): VersionResponse {
    return {
      service: 'veilend-backend',
      version: env.npm_package_version || '0.0.1',
      commit: env.GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      environment: env.NODE_ENV || 'development',
    };
  }

  private validateUrl(value: string, name: string): DependencyReadiness {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return {
          status: 'down',
          reason: `${name} must use http or https`,
        };
      }
      return { status: 'up' };
    } catch {
      return {
        status: 'down',
        reason: `${name} must be a valid URL`,
      };
    }
  }

  private validateRequired(value: string, name: string): DependencyReadiness {
    if (!value.trim()) {
      return {
        status: 'down',
        reason: `${name} must be configured`,
      };
    }
    return { status: 'up' };
  }
}

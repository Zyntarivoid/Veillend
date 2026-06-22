import { Injectable } from '@nestjs/common';
import { HorizonService } from './stellar/horizon.service';
import { SorobanRpcService } from './stellar/soroban-rpc.service';

export interface DependencyStatus {
  status: 'ready' | 'unavailable';
  error: string | null;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  dependencies: {
    horizon: DependencyStatus;
    sorobanRpc: DependencyStatus;
  };
}

@Injectable()
export class AppService {
  constructor(
    private readonly horizonService: HorizonService,
    private readonly sorobanRpcService: SorobanRpcService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'veilend-backend',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness(): ReadinessResponse {
    const dependencies = {
      horizon: this.getDependencyStatus(this.horizonService),
      sorobanRpc: this.getDependencyStatus(this.sorobanRpcService),
    };
    const ready = Object.values(dependencies).every(
      (dependency) => dependency.status === 'ready',
    );

    return {
      status: ready ? 'ready' : 'not_ready',
      dependencies,
    };
  }

  getVersion() {
    return {
      service: 'veilend-backend',
      version: process.env.npm_package_version || '0.0.1',
      commit:
        process.env.GIT_COMMIT ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA ||
        'unknown',
    };
  }

  private getDependencyStatus(service: {
    isHealthy(): boolean;
    getLastError(): string | null;
  }): DependencyStatus {
    return {
      status: service.isHealthy() ? 'ready' : 'unavailable',
      error: service.getLastError(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { HorizonService } from '../stellar/horizon.service';

export interface ComponentStatus {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface SorobanComponentStatus extends ComponentStatus {
  ledgerSeq: number | null;
}

export interface HorizonComponentStatus extends ComponentStatus {
  coreLatestLedger: number | null;
}

export interface HealthResult {
  status: 'ok' | 'degraded';
  components: {
    prisma: ComponentStatus;
    sorobanRpc: SorobanComponentStatus;
    horizon: HorizonComponentStatus;
  };
  timestamp: string;
  uptimeSecs: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sorobanRpc: SorobanRpcService,
    private readonly horizon: HorizonService,
  ) {}

  async probePrisma(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  async probeSoroban(): Promise<SorobanComponentStatus> {
    const start = Date.now();
    try {
      const result = await this.sorobanRpc.getLatestLedger();
      return {
        status: 'up',
        ledgerSeq: result.sequence,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', ledgerSeq: null, latencyMs: Date.now() - start };
    }
  }

  async probeHorizon(): Promise<HorizonComponentStatus> {
    const start = Date.now();
    try {
      const result = (await this.horizon.getRoot()) as Record<string, unknown>;
      return {
        status: 'up',
        coreLatestLedger:
          (result as unknown as { core_latest_ledger?: number })
            .core_latest_ledger ?? null,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        status: 'down',
        coreLatestLedger: null,
        latencyMs: Date.now() - start,
      };
    }
  }

  async check(): Promise<HealthResult> {
    const [prisma, sorobanRpc, horizon] = await Promise.all([
      this.probePrisma(),
      this.probeSoroban(),
      this.probeHorizon(),
    ]);

    const allDown =
      prisma.status === 'down' &&
      sorobanRpc.status === 'down' &&
      horizon.status === 'down';

    const anyDown =
      prisma.status === 'down' ||
      sorobanRpc.status === 'down' ||
      horizon.status === 'down';

    return {
      status: anyDown && !allDown ? 'degraded' : allDown ? 'degraded' : 'ok',
      components: { prisma, sorobanRpc, horizon },
      timestamp: new Date().toISOString(),
      uptimeSecs: Math.floor(process.uptime()),
    };
  }

  async isPrismaReady(): Promise<boolean> {
    const result = await this.probePrisma();
    return result.status === 'up';
  }
}

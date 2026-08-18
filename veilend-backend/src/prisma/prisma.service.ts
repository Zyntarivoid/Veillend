import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();

    // Middleware that captures every Prisma operation and tags them with the
    // current correlation ID. The ID is stored on the params so downstream
    // logging / slow-query analysis can trace back to the originating request.
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
    const useFn = this.$use.bind(this);
    void useFn(
      async (
        params: Prisma.MiddlewareParams,
        next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
      ): Promise<unknown> => {
        const correlationId = this.getCorrelationId();

        if (correlationId) {
          // Attach correlation ID to args for downstream visibility.
          // Prisma will include these in query event logs when log level is set.
          const args = (params as Record<string, unknown>)['args'] ?? {};
          (params as Record<string, unknown>)['args'] = {
            ...(typeof args === 'object' && args !== null ? args : {}),
            __correlationId: correlationId,
          };
        }

        return next(params);
      },
    );
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns the current correlation ID from CLS context, or undefined.
   * Used by other services to tag outbound calls (Stellar RPC, Horizon).
   */
  getCorrelationId(): string | undefined {
    return this.cls.isActive() ? this.cls.getId() : undefined;
  }
}

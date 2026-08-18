import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

import { Injectable } from '@nestjs/common';
import { Prisma, AdminActionStatus, AdminActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAdminActionInput {
  adminAddress: string;
  action: AdminActionType;
  payload: Prisma.InputJsonValue;
}

/**
 * Persistence layer for `AdminAction` intent records. Each row captures a
 * privileged mutation the backend was asked to perform, the unsigned XDR it
 * produced, and the lifecycle status of that intent:
 *
 *   PENDING   → intent recorded; XDR built, awaiting client signature
 *   SENT      → client reported the signed txHash it submitted
 *   CONFIRMED → watcher observed the tx succeed on-chain
 *   FAILED    → XDR build failed or the tx failed on-chain
 */
@Injectable()
export class AdminActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a new intent as PENDING. `xdr` starts as an empty string and is
   * filled in once the unsigned Soroban transaction has been built.
   */
  async create(input: CreateAdminActionInput) {
    return this.prisma.adminAction.create({
      data: {
        adminAddress: input.adminAddress,
        action: input.action,
        payload: input.payload,
        status: AdminActionStatus.PENDING,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.adminAction.findUnique({ where: { id } });
  }

  async updateXdr(id: string, xdr: string) {
    return this.prisma.adminAction.update({
      where: { id },
      data: { xdr },
    });
  }

  /**
   * Transitions PENDING → SENT after the client reports the txHash it signed
   * and submitted. Only allowed while the record is still PENDING.
   */
  async markSent(id: string, txHash: string) {
    return this.prisma.adminAction.update({
      where: { id },
      data: {
        status: AdminActionStatus.SENT,
        txHash,
        submittedAt: new Date(),
      },
    });
  }

  async markConfirmed(id: string) {
    return this.prisma.adminAction.update({
      where: { id },
      data: {
        status: AdminActionStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });
  }

  async markFailed(id: string, error: string) {
    return this.prisma.adminAction.update({
      where: { id },
      data: {
        status: AdminActionStatus.FAILED,
        error,
      },
    });
  }

  /**
   * Records whose signed transaction is waiting to be confirmed on-chain.
   */
  async findSubmitted() {
    return this.prisma.adminAction.findMany({
      where: {
        status: AdminActionStatus.SENT,
        txHash: { not: null },
      },
    });
  }
}

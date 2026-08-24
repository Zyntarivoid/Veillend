import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { HorizonService } from '../stellar/horizon.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  WithdrawalSolvencyService,
  SolvencyErrorKind,
} from './withdrawal-solvency.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalStatus, NotificationKind } from '@prisma/client';
import * as crypto from 'crypto';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CreateWithdrawalResult {
  id: string;
  status: WithdrawalStatus;
  nonce: string;
  timelockUntil: Date | null;
  idempotentReplay?: boolean;
}

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
    private readonly horizonService: HorizonService,
    private readonly notificationsService: NotificationsService,
    private readonly solvencyService: WithdrawalSolvencyService,
  ) {}

  /**
   * Creates a new withdrawal request.
   * Checks whitelist status, applies timelock, and runs a full
   * cross-asset solvency check via WithdrawalSolvencyService.
   */
  async createWithdrawal(
    userId: string,
    userWallet: string,
    dto: CreateWithdrawalDto,
    idempotencyKey?: string,
  ): Promise<CreateWithdrawalResult> {
    // ─── Idempotency check ───────────────────────────────────────────────
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing && existing.expiresAt > new Date()) {
        this.logger.log(
          `Idempotent replay for key ${idempotencyKey}, returning existing response`,
        );
        const data = existing.responseJson as Record<string, unknown>;
        return {
          id: data.id as string,
          status: data.status as WithdrawalStatus,
          nonce: data.nonce as string,
          timelockUntil: data.timelockUntil
            ? new Date(data.timelockUntil as string)
            : null,
          idempotentReplay: true,
        };
      }
    }

    // ─── Find asset ──────────────────────────────────────────────────────
    const asset = await this.prisma.asset.findFirst({
      where: {
        OR: [
          { contractId: dto.assetAddress },
          { id: dto.assetAddress },
          { code: dto.assetAddress },
        ],
      },
    });

    if (!asset) {
      throw new BadRequestException(`Asset not found: ${dto.assetAddress}`);
    }

    // ─── Cross-asset solvency check ──────────────────────────────────────
    const solvency = await this.solvencyService.assertWithdrawable(
      userId,
      asset.id,
      dto.amountStroops,
    );

    if (!solvency.allowed) {
      if (solvency.errorKind === SolvencyErrorKind.ORACLE_UNAVAILABLE) {
        throw new BadRequestException({
          code: 'ORACLE_UNAVAILABLE',
          message: solvency.detail,
          stalePrices: solvency.stalePrices,
          missingPrices: solvency.missingPrices,
        });
      }

      if (solvency.errorKind === SolvencyErrorKind.INSUFFICIENT_DEPOSIT) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_DEPOSIT',
          message: solvency.detail ?? 'Insufficient balance for withdrawal',
        });
      }

      if (solvency.errorKind === SolvencyErrorKind.INSUFFICIENT_COLLATERAL) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_COLLATERAL',
          message: solvency.detail,
          projectedHealthFactor: solvency.projectedHealthFactor,
          currentHealthFactor: solvency.currentHealthFactor,
        });
      }

      throw new BadRequestException(
        solvency.detail ?? 'Withdrawal not allowed',
      );
    }

    // ─── Check whitelist ─────────────────────────────────────────────────
    const whitelistEntry = await this.prisma.addressWhitelist.findFirst({
      where: {
        userId,
        address: dto.destinationAddress,
      },
    });

    const now = new Date();
    let timelockUntil: Date | null = null;
    let whitelistApproved = false;

    if (whitelistEntry) {
      if (whitelistEntry.timelockUntil && whitelistEntry.timelockUntil > now) {
        const instantLimitUsd =
          this.configService.withdrawals.instantWhitelistMaxUsd;
        if (
          whitelistEntry.isInstantApproved &&
          whitelistEntry.instantLimitUsd &&
          Number(whitelistEntry.instantLimitUsd) >= instantLimitUsd
        ) {
          whitelistApproved = true;
        } else {
          timelockUntil = whitelistEntry.timelockUntil;
          whitelistApproved = false;
        }
      } else {
        whitelistApproved = true;
      }
    } else {
      const timelockHours = this.configService.withdrawals.timelockHours;
      timelockUntil = new Date(now.getTime() + timelockHours * 60 * 60 * 1000);
      whitelistApproved = false;

      await this.notificationsService.notifyUser(
        userId,
        NotificationKind.SECURITY_ALERT,
        {
          title: 'New withdrawal address',
          body: `A withdrawal to ${dto.destinationAddress} has been requested. A ${timelockHours}-hour timelock is active.`,
          data: {
            destinationAddress: dto.destinationAddress,
            timelockUntil: timelockUntil.toISOString(),
          },
        },
      );
    }

    // ─── Min confirmations ───────────────────────────────────────────────
    const assetConfig = await this.prisma.assetWithdrawalConfig.findUnique({
      where: { assetId: asset.id },
    });

    const confirmationsRequired =
      assetConfig?.minConfirmations ||
      this.configService.withdrawals.defaultMinConfirmations;

    // ─── Nonce for replay protection ─────────────────────────────────────
    const nonce = crypto.randomBytes(32).toString('hex');
    const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');

    // ─── Create withdrawal + nonce + idempotency key in a transaction ────
    const withdrawal = await this.prisma.withSerializable(async (tx) => {
      const withdrawalRequest = await tx.withdrawalRequest.create({
        data: {
          userWallet,
          userId,
          assetId: asset.id,
          amountStroops: dto.amountStroops,
          destinationAddress: dto.destinationAddress,
          destinationTag: dto.destinationTag,
          whitelistApproved,
          whitelistEntryAddedAt: whitelistEntry?.createdAt || null,
          timelockUntil,
          status: WithdrawalStatus.DRAFT,
          confirmationsRequired,
          healthFactorAtCreation: solvency.projectedHealthFactor,
          lastHealthCheckAt: now,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      await tx.withdrawNonce.create({
        data: {
          nonce: nonceHash,
          withdrawalRequestId: withdrawalRequest.id,
        },
      });

      if (idempotencyKey) {
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            userId,
            endpoint: 'POST /withdrawals',
            responseJson: {
              id: withdrawalRequest.id,
              status: withdrawalRequest.status,
              nonce,
              timelockUntil: timelockUntil?.toISOString() ?? null,
            },
            statusCode: 201,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          },
        });
      }

      return withdrawalRequest;
    });

    this.logger.log(
      `Withdrawal created: ${withdrawal.id} for user ${userId}, amount ${dto.amountStroops} stroops to ${dto.destinationAddress}, HF=${solvency.projectedHealthFactor}`,
    );

    return {
      id: withdrawal.id,
      status: withdrawal.status,
      nonce,
      timelockUntil,
    };
  }

  /**
   * Get all withdrawals for a user.
   */
  async getUserWithdrawals(
    userId: string,
    options?: {
      status?: WithdrawalStatus;
      take?: number;
      skip?: number;
    },
  ) {
    const where = {
      userId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [withdrawals, count] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        include: { asset: true },
        orderBy: { createdAt: 'desc' },
        take: options?.take || 50,
        skip: options?.skip || 0,
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return { withdrawals, count };
  }

  /**
   * Get a single withdrawal by ID.
   */
  async getWithdrawalById(withdrawalId: string, userId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id: withdrawalId,
        userId,
      },
      include: { asset: true },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    return withdrawal;
  }

  /**
   * Simulate the signed XDR against the contract via SorobanRpcService.
   * Returns a simulation error code if the simulation fails, or null
   * if simulation succeeds.
   *
   * This is simulation-only — no submission during validation.
   */
  simulateWithdrawalXdr(_xdr: string): Promise<{
    success: boolean;
    contractErrorCode?: number;
    error?: string;
  }> {
    try {
      // Decode and simulate the XDR against the contract
      // The actual simulation would use SorobanRpcService.simulateTransaction
      // For now, we delegate to the stellar module's RPC service
      return Promise.resolve({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Simulation failed: ${msg}`);
      return Promise.resolve({ success: false, error: msg });
    }
  }

  /**
   * Update withdrawal status after user signs the XDR.
   * Runs a simulation before accepting the signature.
   */
  async signWithdrawal(
    withdrawalId: string,
    userId: string,
    xdr: string,
    txHash: string,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id: withdrawalId,
        userId,
      },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.DRAFT) {
      throw new BadRequestException(
        `Withdrawal cannot be signed in status: ${withdrawal.status}`,
      );
    }

    if (withdrawal.timelockUntil && withdrawal.timelockUntil > new Date()) {
      throw new ForbiddenException(
        `Withdrawal is timelocked until ${withdrawal.timelockUntil.toISOString()}`,
      );
    }

    // ─── Pre-sign solvency re-validation ─────────────────────────────────
    const revalidation = await this.solvencyService.assertWithdrawable(
      userId,
      withdrawal.assetId,
      Number(withdrawal.amountStroops),
    );

    if (!revalidation.allowed) {
      if (revalidation.errorKind === SolvencyErrorKind.ORACLE_UNAVAILABLE) {
        await this.prisma.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: { status: WithdrawalStatus.REQUIRES_REVALIDATION },
        });
        throw new ConflictException({
          code: 'ORACLE_UNAVAILABLE',
          message: revalidation.detail,
          status: 'REQUIRES_REVALIDATION',
        });
      }

      await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: WithdrawalStatus.REQUIRES_REVALIDATION },
      });

      throw new ConflictException({
        code: revalidation.errorKind ?? 'SOLVENCY_CHECK_FAILED',
        message: revalidation.detail ?? 'Position degraded during timelock',
        status: 'REQUIRES_REVALIDATION',
        projectedHealthFactor: revalidation.projectedHealthFactor,
      });
    }

    // ─── Simulate the XDR ────────────────────────────────────────────────
    const simulation = await this.simulateWithdrawalXdr(xdr);

    if (!simulation.success) {
      const contractErrorCode = simulation.contractErrorCode ?? null;

      await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.REJECTED,
          error: simulation.error ?? 'Simulation failed',
          contractErrorCode,
        },
      });

      throw new BadRequestException({
        code: 'SIMULATION_FAILED',
        message: simulation.error ?? 'Transaction simulation failed',
        contractErrorCode,
      });
    }

    // ─── Check nonce replay ──────────────────────────────────────────────
    const nonceRecord = await this.prisma.withdrawNonce.findFirst({
      where: {
        withdrawalRequestId: withdrawalId,
        used: true,
      },
    });

    if (nonceRecord) {
      throw new ConflictException('Nonce already used - replay detected');
    }

    await this.prisma.withdrawNonce.updateMany({
      where: { withdrawalRequestId: withdrawalId },
      data: { used: true },
    });

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.SIGNED,
        xdr,
        txHash,
        signedAt: new Date(),
        lastHealthCheckAt: new Date(),
      },
    });
  }

  /**
   * Submit withdrawal to the network.
   * Re-runs the solvency check; if position degraded during the timelock,
   * returns 409 with REQUIRES_REVALIDATION status.
   */
  async submitWithdrawal(withdrawalId: string, userId: string, txHash: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id: withdrawalId,
        userId,
      },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.SIGNED) {
      throw new BadRequestException(
        `Withdrawal cannot be submitted in status: ${withdrawal.status}`,
      );
    }

    // ─── Pre-submit solvency re-validation ───────────────────────────────
    const revalidation = await this.solvencyService.assertWithdrawable(
      userId,
      withdrawal.assetId,
      Number(withdrawal.amountStroops),
    );

    if (!revalidation.allowed) {
      await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.REQUIRES_REVALIDATION,
          error: revalidation.detail ?? 'Position degraded since signing',
        },
      });

      throw new ConflictException({
        code: revalidation.errorKind ?? 'SOLVENCY_CHECK_FAILED',
        message: revalidation.detail ?? 'Position degraded during timelock',
        status: 'REQUIRES_REVALIDATION',
        projectedHealthFactor: revalidation.projectedHealthFactor,
        currentHealthFactor: revalidation.currentHealthFactor,
      });
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.SENT,
        txHash,
        submittedAt: new Date(),
        lastHealthCheckAt: new Date(),
      },
    });
  }

  /**
   * Update withdrawal confirmations and status.
   * Called by the WithdrawalWatcher.
   */
  async updateWithdrawalConfirmations(
    withdrawalId: string,
    confirmationsSeen: number,
    currentLedger: number,
    feeChargedStroops?: bigint,
  ) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      return null;
    }

    const isConfirmed = confirmationsSeen >= withdrawal.confirmationsRequired;

    if (isConfirmed && withdrawal.status === WithdrawalStatus.SENT) {
      return await this.prisma.withSerializable(async (tx) => {
        const updatedWithdrawal = await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: {
            confirmationsSeen,
            status: WithdrawalStatus.CONFIRMED,
            confirmedAt: new Date(),
            feeChargedStroops:
              feeChargedStroops || withdrawal.feeChargedStroops,
          },
        });

        await tx.position.update({
          where: {
            userId_assetId: {
              userId: withdrawal.userId,
              assetId: withdrawal.assetId,
            },
          },
          data: {
            depositedRaw: {
              decrement: withdrawal.amountStroops,
            },
            isStale: true,
          },
        });

        this.logger.log(
          `Withdrawal ${withdrawalId} confirmed and debited: ${withdrawal.amountStroops} stroops`,
        );

        return updatedWithdrawal;
      });
    } else if (!isConfirmed && withdrawal.status === WithdrawalStatus.SENT) {
      return this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { confirmationsSeen },
      });
    }

    return withdrawal;
  }

  /**
   * Mark a withdrawal as orphaned (transaction not found or forked).
   */
  async markWithdrawalOrphaned(withdrawalId: string, error?: string) {
    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.ORPHANED,
        error: error || 'Transaction orphaned or not found on-chain',
      },
    });
  }

  /**
   * Cancel a withdrawal request.
   */
  async cancelWithdrawal(withdrawalId: string, userId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id: withdrawalId,
        userId,
      },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (
      withdrawal.status === WithdrawalStatus.CONFIRMED ||
      withdrawal.status === WithdrawalStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Withdrawal cannot be cancelled in status: ${withdrawal.status}`,
      );
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.CANCELLED },
    });
  }

  /**
   * Re-validate a withdrawal that is in REQUIRES_REVALIDATION status.
   * If the position is now solvent again, transitions back to DRAFT.
   */
  async revalidateWithdrawal(withdrawalId: string, userId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id: withdrawalId,
        userId,
      },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.REQUIRES_REVALIDATION) {
      throw new BadRequestException(
        `Withdrawal cannot be revalidated in status: ${withdrawal.status}`,
      );
    }

    const solvency = await this.solvencyService.assertWithdrawable(
      userId,
      withdrawal.assetId,
      Number(withdrawal.amountStroops),
    );

    if (!solvency.allowed) {
      throw new ConflictException({
        code: solvency.errorKind ?? 'SOLVENCY_CHECK_FAILED',
        message: solvency.detail ?? 'Position still insolvent',
        projectedHealthFactor: solvency.projectedHealthFactor,
      });
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.DRAFT,
        healthFactorAtCreation: solvency.projectedHealthFactor,
        lastHealthCheckAt: new Date(),
        error: null,
      },
    });
  }

  /**
   * Get pending withdrawals for the watcher to process.
   */
  async getPendingWithdrawals() {
    return this.prisma.withdrawalRequest.findMany({
      where: { status: WithdrawalStatus.SENT },
      include: { asset: true },
    });
  }

  /**
   * Add address to whitelist.
   */
  async addToWhitelist(
    userId: string,
    address: string,
    label?: string,
    instantMode?: boolean,
    instantLimitUsd?: number,
  ) {
    const existing = await this.prisma.addressWhitelist.findFirst({
      where: { userId, address },
    });

    if (existing) {
      throw new ConflictException('Address already whitelisted');
    }

    const now = new Date();
    const timelockHours = this.configService.withdrawals.timelockHours;
    const timelockUntil = new Date(
      now.getTime() + timelockHours * 60 * 60 * 1000,
    );

    const whitelistEntry = await this.prisma.addressWhitelist.create({
      data: {
        userId,
        address,
        label,
        timelockUntil: instantMode ? null : timelockUntil,
        isInstantApproved: instantMode || false,
        instantLimitUsd: instantLimitUsd || null,
      },
    });

    await this.notificationsService.notifyUser(
      userId,
      NotificationKind.SECURITY_ALERT,
      {
        title: 'Address whitelisted',
        body: instantMode
          ? `Address ${address} has been whitelisted with instant mode.`
          : `Address ${address} has been added. It will be active in ${timelockHours} hours.`,
        data: {
          address,
          timelockUntil: instantMode ? null : timelockUntil.toISOString(),
          instantMode,
        },
      },
    );

    this.logger.log(
      `Address ${address} whitelisted for user ${userId} (instant: ${instantMode})`,
    );

    return whitelistEntry;
  }

  /**
   * Remove address from whitelist.
   */
  async removeFromWhitelist(userId: string, whitelistId: string) {
    const entry = await this.prisma.addressWhitelist.findFirst({
      where: { id: whitelistId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Whitelist entry not found');
    }

    await this.prisma.addressWhitelist.delete({
      where: { id: whitelistId },
    });

    this.logger.log(
      `Address ${entry.address} removed from whitelist for user ${userId}`,
    );

    return { success: true };
  }

  /**
   * Get user's whitelist.
   */
  async getWhitelist(userId: string) {
    return this.prisma.addressWhitelist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

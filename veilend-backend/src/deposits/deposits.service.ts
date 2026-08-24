import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { HorizonService } from '../stellar/horizon.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositStatus, Prisma } from '@prisma/client';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
    private readonly horizonService: HorizonService,
  ) {}

  /**
   * Records a new deposit as PENDING when a user reports an on-chain transfer.
   * The watcher will then monitor confirmations before crediting.
   * Supports idempotency via the optional idempotencyKey parameter.
   */
  async createDeposit(
    userId: string,
    userWallet: string,
    dto: CreateDepositDto,
    idempotencyKey?: string,
  ) {
    // ─── Idempotency check ───────────────────────────────────────────────
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing && existing.expiresAt > new Date()) {
        this.logger.log(
          `Idempotent replay for deposit key ${idempotencyKey}, returning existing response`,
        );
        return existing.responseJson;
      }
    }
    // Find or create the asset
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

    // Check if deposit already exists (idempotent)
    const existing = await this.prisma.userDeposit.findUnique({
      where: { txHash: dto.txHash },
    });

    if (existing) {
      throw new ConflictException(
        'Deposit with this transaction hash already exists',
      );
    }

    // Get min confirmations from config or asset-specific config
    const assetConfig = await this.prisma.assetWithdrawalConfig.findUnique({
      where: { assetId: asset.id },
    });

    const confirmationsRequired =
      assetConfig?.minConfirmations ||
      this.configService.deposits.defaultMinConfirmations;

    // Create the deposit record
    const deposit = await this.prisma.userDeposit.create({
      data: {
        userWallet,
        userId,
        assetId: asset.id,
        amountStroops: dto.amountStroops,
        txHash: dto.txHash,
        ledgerSeq: dto.ledgerSeq,
        confirmationsRequired,
        status: DepositStatus.PENDING,
      },
      include: {
        asset: true,
      },
    });

    // Store idempotency key if provided
    if (idempotencyKey) {
      const now = new Date();
      await this.prisma.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          endpoint: 'POST /deposits',
          responseJson: deposit as unknown as Prisma.InputJsonValue,
          statusCode: 201,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
    }

    this.logger.log(
      `Deposit created: ${deposit.id} for user ${userId}, amount ${dto.amountStroops} stroops, pending ${confirmationsRequired} confirmations`,
    );

    return deposit;
  }

  /**
   * Get all deposits for a user.
   */
  async getUserDeposits(
    userId: string,
    options?: {
      status?: DepositStatus;
      take?: number;
      skip?: number;
    },
  ) {
    const where = {
      userId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [deposits, count] = await Promise.all([
      this.prisma.userDeposit.findMany({
        where,
        include: { asset: true },
        orderBy: { createdAt: 'desc' },
        take: options?.take || 50,
        skip: options?.skip || 0,
      }),
      this.prisma.userDeposit.count({ where }),
    ]);

    return { deposits, count };
  }

  /**
   * Get a single deposit by ID.
   */
  async getDepositById(depositId: string, userId: string) {
    const deposit = await this.prisma.userDeposit.findFirst({
      where: {
        id: depositId,
        userId,
      },
      include: { asset: true },
    });

    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }

    return deposit;
  }

  /**
   * Update deposit confirmations and status.
   * Called by the DepositWatcher.
   */
  async updateDepositConfirmations(
    depositId: string,
    confirmationsSeen: number,
    currentLedger: number,
  ) {
    const deposit = await this.prisma.userDeposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      return null;
    }

    // Check if deposit is confirmed
    const ledgerDiff = currentLedger - deposit.ledgerSeq;
    const isConfirmed = ledgerDiff >= deposit.confirmationsRequired;

    if (isConfirmed && deposit.status === DepositStatus.PENDING) {
      // Credit user balance
      return await this.prisma.withSerializable(async (tx) => {
        // Update deposit status
        const updatedDeposit = await tx.userDeposit.update({
          where: { id: depositId },
          data: {
            confirmationsSeen: confirmationsSeen,
            status: DepositStatus.CONFIRMED,
            creditedAt: new Date(),
          },
        });

        // Find or create position for this user and asset
        const position = await tx.position.upsert({
          where: {
            userId_assetId: {
              userId: deposit.userId,
              assetId: deposit.assetId,
            },
          },
          create: {
            userId: deposit.userId,
            assetId: deposit.assetId,
            depositedRaw: deposit.amountStroops,
            isStale: true,
          },
          update: {
            depositedRaw: {
              increment: deposit.amountStroops,
            },
            isStale: true,
          },
        });

        this.logger.log(
          `Deposit ${depositId} confirmed and credited: ${deposit.amountStroops} stroops to position ${position.id}`,
        );

        return updatedDeposit;
      });
    } else if (!isConfirmed && deposit.status === DepositStatus.PENDING) {
      // Just update confirmations count
      return await this.prisma.userDeposit.update({
        where: { id: depositId },
        data: {
          confirmationsSeen: confirmationsSeen,
        },
      });
    }

    return deposit;
  }

  /**
   * Mark a deposit as orphaned (transaction not found or forked).
   */
  async markDepositOrphaned(depositId: string) {
    return this.prisma.userDeposit.update({
      where: { id: depositId },
      data: {
        status: DepositStatus.ORPHANED,
      },
    });
  }

  /**
   * Get pending deposits for the watcher to process.
   */
  async getPendingDeposits() {
    return this.prisma.userDeposit.findMany({
      where: {
        status: DepositStatus.PENDING,
      },
      include: { asset: true },
    });
  }

  /**
   * Get the latest cursor for a specific asset's transaction stream.
   */
  async getLatestCursor(assetId: string): Promise<string | null> {
    // Get the most recent deposit for this asset to use as cursor
    const latest = await this.prisma.userDeposit.findFirst({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      select: { txHash: true },
    });

    return latest?.txHash || null;
  }
}

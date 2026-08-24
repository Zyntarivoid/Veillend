import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositStatus } from '@prisma/client';
import { PageOptionsDto } from '../common/dto/page-options.dto';
import type { Request } from 'express';

interface AuthenticatedUser {
  walletAddress: string;
  sessionId: string;
  expiresAt: Date;
}

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('deposits')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  /**
   * Record a new deposit from an on-chain transfer.
   * The user reports the txHash after making the transfer.
   * Accepts an optional Idempotency-Key header; a repeat within 24h
   * returns the original record instead of creating a duplicate.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDeposit(
    @Body() dto: CreateDepositDto,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.depositsService.createDeposit(
      req.user.sessionId, // Will be replaced with actual userId
      req.user.walletAddress,
      dto,
      idempotencyKey,
    );
  }

  /**
   * Get all deposits for the authenticated user.
   */
  @Get()
  async getUserDeposits(
    @Query() pageOptions: PageOptionsDto,
    @Query('status') status?: string,
    @Req() req?: RequestWithUser,
  ) {
    return this.depositsService.getUserDeposits(
      req!.user.sessionId, // Will be replaced with actual userId
      {
        status: status ? (status as DepositStatus) : undefined,
        take: pageOptions.take,
        skip: pageOptions.skip,
      },
    );
  }

  /**
   * Get a single deposit by ID.
   */
  @Get(':id')
  async getDepositById(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.depositsService.getDepositById(
      id,
      req.user.sessionId, // Will be replaced with actual userId
    );
  }

  /**
   * Admin endpoint to get pending deposits (for monitoring).
   */
  @Get('admin/pending')
  async getPendingDeposits() {
    return this.depositsService.getPendingDeposits();
  }
}

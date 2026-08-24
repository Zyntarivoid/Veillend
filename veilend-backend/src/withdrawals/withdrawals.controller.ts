import {
  Controller,
  Get,
  Post,
  Delete,
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
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalStatus } from '@prisma/client';
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

@Controller('withdrawals')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  /**
   * Create a new withdrawal request.
   * Accepts an optional Idempotency-Key header; a repeat within 24h
   * returns the original record instead of creating a duplicate.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWithdrawal(
    @Body() dto: CreateWithdrawalDto,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.withdrawalsService.createWithdrawal(
      req.user.sessionId,
      req.user.walletAddress,
      dto,
      idempotencyKey,
    );
  }

  /**
   * Get all withdrawals for the authenticated user.
   */
  @Get()
  async getUserWithdrawals(
    @Query() pageOptions: PageOptionsDto,
    @Query('status') status?: string,
    @Req() req?: RequestWithUser,
  ) {
    return this.withdrawalsService.getUserWithdrawals(req!.user.sessionId, {
      status: status ? (status as WithdrawalStatus) : undefined,
      take: pageOptions.take,
      skip: pageOptions.skip,
    });
  }

  /**
   * Get a single withdrawal by ID.
   */
  @Get(':id')
  async getWithdrawalById(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.getWithdrawalById(id, req.user.sessionId);
  }

  /**
   * Sign a withdrawal request with the XDR.
   * Runs pre-sign solvency re-validation and XDR simulation before accepting.
   */
  @Post(':id/sign')
  @HttpCode(HttpStatus.ACCEPTED)
  async signWithdrawal(
    @Param('id') id: string,
    @Body() body: { xdr: string; txHash: string },
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.signWithdrawal(
      id,
      req.user.sessionId,
      body.xdr,
      body.txHash,
    );
  }

  /**
   * Submit withdrawal to the network.
   * Re-runs solvency check; if position degraded, returns 409 with
   * REQUIRES_REVALIDATION status.
   */
  @Post(':id/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitWithdrawal(
    @Param('id') id: string,
    @Body() body: { txHash: string },
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.submitWithdrawal(
      id,
      req.user.sessionId,
      body.txHash,
    );
  }

  /**
   * Re-validate a withdrawal that is in REQUIRES_REVALIDATION status.
   * If the position is solvent again, transitions back to DRAFT.
   */
  @Post(':id/revalidate')
  @HttpCode(HttpStatus.ACCEPTED)
  async revalidateWithdrawal(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.revalidateWithdrawal(id, req.user.sessionId);
  }

  /**
   * Cancel a withdrawal request.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  async cancelWithdrawal(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.withdrawalsService.cancelWithdrawal(id, req.user.sessionId);
  }

  /**
   * Get pending withdrawals (admin endpoint).
   */
  @Get('admin/pending')
  async getPendingWithdrawals() {
    return this.withdrawalsService.getPendingWithdrawals();
  }

  /**
   * Add address to whitelist.
   */
  @Post('whitelist')
  @HttpCode(HttpStatus.CREATED)
  async addToWhitelist(
    @Body()
    body: {
      address: string;
      label?: string;
      instantMode?: boolean;
      instantLimitUsd?: number;
    },
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.addToWhitelist(
      req.user.sessionId,
      body.address,
      body.label,
      body.instantMode,
      body.instantLimitUsd,
    );
  }

  /**
   * Get user's whitelist.
   */
  @Get('whitelist')
  async getWhitelist(@Req() req: RequestWithUser) {
    return this.withdrawalsService.getWhitelist(req.user.sessionId);
  }

  /**
   * Remove address from whitelist.
   */
  @Delete('whitelist/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  async removeFromWhitelist(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    return this.withdrawalsService.removeFromWhitelist(req.user.sessionId, id);
  }
}

import { Controller, Post, Body } from '@nestjs/common';

import { AuthService } from './auth.service';

import { VerifyWalletDto } from './dto/verify-wallet.dto';

import { NonceDto } from './dto/nonce.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('nonce')
  createNonce(@Body() dto: NonceDto) {
    const nonce = this.authService.generateNonce(dto.walletAddress);

    return {
      nonce,
    };
  }

  @Post('verify')
  verify(@Body() dto: VerifyWalletDto) {
    return this.authService.verifyWallet(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
    );
  }
}

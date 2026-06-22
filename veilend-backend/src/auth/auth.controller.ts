import { Controller, Post, Body } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';

import { VerifyWalletDto } from './dto/verify-wallet.dto';

import { NonceDto } from './dto/nonce.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('nonce')
  @ApiOperation({ summary: 'Create a wallet-login nonce' })
  @ApiBody({ type: NonceDto })
  @ApiOkResponse({
    description: 'Nonce to sign with the requesting wallet.',
    schema: {
      example: { nonce: '6e165df1-2bd7-4f63-947c-d9b5f5e6a2bb' },
      properties: { nonce: { type: 'string' } },
      type: 'object',
    },
  })
  createNonce(@Body() dto: NonceDto) {
    const nonce = this.authService.generateNonce(dto.walletAddress);

    return {
      nonce,
    };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify a signed wallet nonce' })
  @ApiBody({ type: VerifyWalletDto })
  @ApiOkResponse({
    description: 'Wallet verification result returned by the auth service.',
    schema: {
      example: { token: 'jwt-token', walletAddress: 'GABCD...EXAMPLE' },
      type: 'object',
      additionalProperties: true,
    },
  })
  verify(@Body() dto: VerifyWalletDto) {
    return this.authService.verifyWallet(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
    );
  }
}

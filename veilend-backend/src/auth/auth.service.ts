import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { WalletService } from '../wallet/wallet.service';

import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private walletService: WalletService,
    private jwtService: JwtService,
  ) {}

  generateNonce(walletAddress: string) {
    const nonce = randomBytes(32).toString('hex');

    console.log('Nonce created for:', walletAddress);

    return nonce;
  }

  verifyWallet(walletAddress: string, nonce: string, signature: string) {
    const valid = this.walletService.verifySignature(
      walletAddress,
      nonce,
      signature,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    const token = this.jwtService.sign({
      walletAddress,
    });

    return {
      accessToken: token,
    };
  }
}

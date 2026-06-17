import { Injectable } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';

@Injectable()
export class WalletService {
  verifySignature(walletAddress: string, message: string, signature: string) {
    const keypair = Keypair.fromPublicKey(walletAddress);

    const verified = keypair.verify(
      Buffer.from(message),
      Buffer.from(signature, 'base64'),
    );

    return verified;
  }
}

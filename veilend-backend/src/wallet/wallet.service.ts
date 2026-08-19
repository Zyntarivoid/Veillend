import { Injectable } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { createHash } from 'node:crypto';

/** SEP-53 framing prefix for off-chain message signing. */
const MESSAGE_PREFIX = 'Stellar Signed Message:\n';

@Injectable()
export class WalletService {
  /**
   * Verify an Ed25519 signature produced over the SEP-53 payload
   * SHA-256("Stellar Signed Message:\n" + message). This is the framing
   * Freighter and other Stellar wallets use for `signMessage`, so the
   * frontend challenge-response can be verified without trusting the client.
   */
  verifySignature(walletAddress: string, message: string, signature: string) {
    try {
      const keypair = Keypair.fromPublicKey(walletAddress);

      const encodedMessage = Buffer.concat([
        Buffer.from(MESSAGE_PREFIX, 'utf8'),
        Buffer.from(message, 'utf8'),
      ]);
      const messageHash = createHash('sha256').update(encodedMessage).digest();

      const signatureBytes = Buffer.from(signature, 'base64');
      if (signatureBytes.length !== 64) {
        return false;
      }

      return keypair.verify(messageHash, signatureBytes);
    } catch {
      return false;
    }
  }
}

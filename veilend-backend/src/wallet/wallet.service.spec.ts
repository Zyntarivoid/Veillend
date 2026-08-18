import { Keypair } from 'stellar-sdk';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  it('verifies a valid SEP-53 signature over the message', () => {
    const address = 'GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
    const message = 'Hello, World!';
    const signature =
      'fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==';

    expect(service.verifySignature(address, message, signature)).toBe(true);
  });

  it('rejects a signature over the raw message (non SEP-53 framing)', () => {
    // Signature over the raw "Hello, World!" bytes must NOT verify against
    // the SEP-53 SHA-256 payload.
    const keypair = Keypair.fromSecret(
      'SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW',
    );
    const rawSignature = keypair
      .sign(Buffer.from('Hello, World!', 'utf8'))
      .toString('base64');

    expect(
      service.verifySignature(
        keypair.publicKey(),
        'Hello, World!',
        rawSignature,
      ),
    ).toBe(false);
  });

  it('rejects an invalid or malformed signature', () => {
    const address = 'GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
    const garbageSignature = Buffer.alloc(64).toString('base64');

    expect(
      service.verifySignature(address, 'nonce-123', garbageSignature),
    ).toBe(false);
    expect(service.verifySignature(address, 'nonce-123', 'AAAA')).toBe(false);
  });
});

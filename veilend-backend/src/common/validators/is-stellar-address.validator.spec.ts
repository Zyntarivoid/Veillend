import { validate } from 'class-validator';
import { Keypair } from '@stellar/stellar-sdk';
import { IsStellarAddress } from './is-stellar-address.validator';

class TestDto {
  @IsStellarAddress()
  walletAddress: string;
}

async function errorsFor(walletAddress: unknown): Promise<string[]> {
  const dto = new TestDto();
  dto.walletAddress = walletAddress as string;
  const errors = await validate(dto);
  if (errors.length === 0) return [];
  return Object.values(errors[0].constraints ?? {});
}

describe('IsStellarAddress', () => {
  const validAddress = Keypair.random().publicKey();

  it('accepts a valid G-address', async () => {
    expect(await errorsFor(validAddress)).toEqual([]);
  });

  it('rejects an empty string', async () => {
    expect(await errorsFor('')).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects an S-prefixed secret key', async () => {
    const secret = Keypair.random().secret();
    expect(await errorsFor(secret)).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects an address that is too short (55 chars)', async () => {
    expect(await errorsFor(validAddress.slice(0, 55))).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects an address that is too long (57 chars)', async () => {
    expect(await errorsFor(validAddress + 'A')).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects non-base32 characters', async () => {
    // '0', '1', '8', '9' are outside the base32 (A-Z2-7) alphabet.
    const tampered = 'G0' + validAddress.slice(2);
    expect(await errorsFor(tampered)).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects a lowercase version of a valid address', async () => {
    expect(await errorsFor(validAddress.toLowerCase())).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });

  it('rejects non-string values', async () => {
    expect(await errorsFor(12345)).toEqual([
      'Must be a valid Stellar public key (G...)',
    ]);
  });
});

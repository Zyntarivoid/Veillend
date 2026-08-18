import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';

const STELLAR_ED25519_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

// Falls back to a shape-only check (length 56, "G" prefix, base32 body)
// if StrKey is ever unavailable, so validation degrades safely instead
// of silently passing every string through.
export function isStellarAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  if (typeof StrKey?.isValidEd25519PublicKey === 'function') {
    return StrKey.isValidEd25519PublicKey(value);
  }

  return STELLAR_ED25519_PUBLIC_KEY_PATTERN.test(value);
}

// Validates a Stellar Ed25519 public key: 56 chars, "G" prefix, base32
// (A-Z2-7) body, plus the CRC16-XModem checksum StrKey enforces.
export function IsStellarAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStellarAddress',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Must be a valid Stellar public key (G...)',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          return isStellarAddress(value);
        },
      },
    });
  };
}

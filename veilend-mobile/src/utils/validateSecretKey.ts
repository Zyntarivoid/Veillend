import { Keypair } from '@stellar/stellar-base';

export interface ValidationResult {
  valid: boolean;
  /** Guidance message shown in the inline chip when key is not yet valid */
  error?: string;
}

/**
 * Progressively validates a Stellar secret key (strkey S…).
 * Returns the first failing hint so the UI can guide the user step-by-step:
 *   "Starts with S" → "56 characters long" → "Valid strkey ✔️" (valid=true)
 */
export function validateSecretKey(key: string): ValidationResult {
  if (!key.startsWith('S')) {
    return { valid: false, error: 'Starts with S' };
  }
  if (key.length < 56) {
    return { valid: false, error: '56 characters long' };
  }
  if (!/^S[A-Z2-7]{55}$/.test(key)) {
    return { valid: false, error: 'Only A–Z and 2–7 characters allowed' };
  }
  try {
    Keypair.fromSecret(key);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid strkey checksum' };
  }
}

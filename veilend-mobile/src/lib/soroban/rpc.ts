/**
 * Thin Soroban RPC client for the mobile app.
 *
 * Covers:
 *  - sendTransaction  — broadcast a signed XDR envelope
 *  - getTransaction   — poll for confirmation status
 *  - pollTransaction  — convenience wrapper: poll every 2 s up to 60 s
 *
 * Intentionally minimal: no SDK dependency beyond what stellar-base already
 * provides. All network calls use the plain `fetch` global (available in
 * React Native and in Jest with the correct setup).
 */

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

/** Resolve the Soroban RPC URL from env or fall back to testnet. */
function getSorobanRpcUrl(): string {
  // Expo exposes env vars on process.env at bundle time.
  // The variable must be prefixed with nothing special in bare React Native,
  // but babel-plugin-transform-inline-environment-variables picks it up.
  return (
    (process.env.SOROBAN_RPC_URL as string | undefined) ??
    'https://soroban-testnet.stellar.org'
  );
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type SendTransactionResult =
  | { status: 'PENDING'; hash: string }
  | { status: 'ERROR'; error: string };

export type GetTransactionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_FOUND';

export type SimulationResult = {
  ok: boolean;
  error?: string;
  healthFactor?: number;
};

export interface GetTransactionResult {
  status: GetTransactionStatus;
  /** Present when status === 'SUCCESS'. */
  ledger?: number;
  /** Present when status === 'FAILED'. Raw base64 XDR result. */
  resultXdr?: string;
  /** Present when status === 'FAILED' and error detail is available. */
  errorResultXdr?: string;
}

// ──────────────────────────────────────────────────────────────
// JSON-RPC helper
// ──────────────────────────────────────────────────────────────

async function rpcCall<T>(
  method: string,
  params: unknown[],
  rpcUrl: string = getSorobanRpcUrl(),
): Promise<T> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Soroban RPC HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`Soroban RPC error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Broadcast a signed transaction XDR to the Soroban RPC node.
 *
 * @param signedXdr  Base64-encoded signed transaction envelope.
 * @returns          `{ status: 'PENDING', hash }` on success, or
 *                   `{ status: 'ERROR', error }` if the node rejected it.
 */
export async function sendTransaction(
  signedXdr: string,
  rpcUrl?: string,
): Promise<SendTransactionResult> {
  try {
    const result = await rpcCall<{ status: string; hash?: string; errorResultXdr?: string }>(
      'sendTransaction',
      [{ transaction: signedXdr }],
      rpcUrl,
    );

    if (result.status === 'ERROR') {
      return { status: 'ERROR', error: result.errorResultXdr ?? 'Transaction rejected by node' };
    }

    return { status: 'PENDING', hash: result.hash ?? '' };
  } catch (err: any) {
    return { status: 'ERROR', error: err?.message ?? 'Failed to send transaction' };
  }
}

/** Simulate an unsigned Soroban transaction immediately before signing. */
export async function simulateTransaction(
  unsignedXdr: string,
  rpcUrl?: string,
): Promise<SimulationResult> {
  try {
    const result = await rpcCall<{ error?: string; result?: { retval?: unknown; healthFactor?: number } }>(
      'simulateTransaction',
      [{ transaction: unsignedXdr }],
      rpcUrl,
    );
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, healthFactor: result.result?.healthFactor };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? 'Simulation failed' };
  }
}

/**
 * Fetch the current status of a submitted transaction by its hash.
 */
export async function getTransaction(
  hash: string,
  rpcUrl?: string,
): Promise<GetTransactionResult> {
  const result = await rpcCall<{
    status: string;
    ledger?: number;
    resultXdr?: string;
    errorResultXdr?: string;
  }>('getTransaction', [{ hash }], rpcUrl);

  const status = (result.status ?? 'NOT_FOUND').toUpperCase() as GetTransactionStatus;
  return {
    status,
    ledger: result.ledger,
    resultXdr: result.resultXdr,
    errorResultXdr: result.errorResultXdr,
  };
}

/**
 * Poll `getTransaction` every `intervalMs` ms until the transaction reaches
 * a terminal state (SUCCESS or FAILED) or `timeoutMs` is exceeded.
 *
 * Throws with a timeout message if the transaction does not confirm in time.
 */
export async function pollTransaction(
  hash: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    rpcUrl?: string;
  } = {},
): Promise<GetTransactionResult> {
  const intervalMs = options.intervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const rpcUrl = options.rpcUrl;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getTransaction(hash, rpcUrl);

    if (result.status === 'SUCCESS' || result.status === 'FAILED') {
      return result;
    }

    // NOT_FOUND or PENDING — wait and retry.
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Network error, please retry — transaction confirmation timed out.');
}

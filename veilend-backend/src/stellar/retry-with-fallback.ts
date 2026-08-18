import { Logger } from '@nestjs/common';

export type ProviderState = 'closed' | 'open' | 'half-open';

export interface Provider {
  url: string;
  state: ProviderState;
  failureCount: number;
  nextProbeAt: number;
}

export type WriteOptions = { mode: 'write'; maxAttempts?: 1 };
export type ReadOptions = { mode: 'read'; maxAttempts?: number };
export type RetryOptions = WriteOptions | ReadOptions;

const CIRCUIT_OPEN_FAILURES = 10;
const COOLDOWN_MS = 30000;

export class CircuitBreakerManager<TClient> {
  private providers: { provider: Provider; client: TClient }[] = [];
  private readonly logger = new Logger(CircuitBreakerManager.name);

  constructor(
    private readonly name: string,
    urls: string[],
    clientFactory: (url: string) => TClient,
  ) {
    if (!urls || urls.length === 0) {
      throw new Error(
        `[${this.name}] Cannot initialize CircuitBreakerManager with empty urls`,
      );
    }
    this.providers = urls.map((url) => ({
      provider: {
        url,
        state: 'closed',
        failureCount: 0,
        nextProbeAt: 0,
      },
      client: clientFactory(url),
    }));
  }

  getProviders() {
    return this.providers;
  }

  public getPrimaryClient(): TClient {
    if (this.providers.length === 0) {
      throw new Error(`[${this.name}] No providers available.`);
    }
    return this.providers[0].client;
  }

  async execute<TResult>(
    operationId: string,
    operation: (client: TClient) => Promise<TResult>,
    options: RetryOptions,
  ): Promise<TResult> {
    const isWrite = options.mode === 'write';
    // For writes, exactly 1 attempt. For reads, default to 3 unless specified.
    const maxAttempts = isWrite ? 1 : options.maxAttempts || 3;

    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt++;

      const providerInfo = this.getNextAvailableProvider();
      if (!providerInfo) {
        throw new Error(
          `[${this.name}] All providers are currently failing (Circuit Open)`,
        );
      }

      const { provider, client } = providerInfo;

      try {
        const result = await operation(client);

        // Success: reset circuit
        if (provider.state !== 'closed') {
          this.logger.log(
            `[${this.name}] Circuit closed for ${provider.url} after successful probe`,
          );
        }
        provider.state = 'closed';
        provider.failureCount = 0;
        provider.nextProbeAt = 0;

        return result;
      } catch (error: unknown) {
        lastError = error;

        // Determine if it's a 4xx error which should NOT count towards circuit breaker (unless 429)
        // For simplicity, we only trigger circuit breaker if error message has 5xx or 429 or is network error.
        // If it's a write operation, we just throw immediately (enforced below) but still might want to mark failure.
        let isServerError = true;

        if (error && typeof error === 'object') {
          const errObj = error as Record<string, unknown>;
          let status: number | undefined;
          if (
            'response' in errObj &&
            errObj.response &&
            typeof errObj.response === 'object'
          ) {
            const resp = errObj.response as Record<string, unknown>;
            if (typeof resp.status === 'number') {
              status = resp.status;
            }
          } else if ('status' in errObj && typeof errObj.status === 'number') {
            status = errObj.status;
          }

          if (status && status >= 400 && status < 500 && status !== 429) {
            isServerError = false;
          }
        }

        if (isServerError) {
          provider.failureCount++;

          if (provider.state === 'half-open') {
            this.logger.warn(
              `[${this.name}] Probe failed for ${provider.url}, reopening circuit.`,
            );
            provider.state = 'open';
            provider.nextProbeAt = Date.now() + COOLDOWN_MS;
          } else if (provider.failureCount >= CIRCUIT_OPEN_FAILURES) {
            if (provider.state === 'closed') {
              this.logger.warn(
                `[${this.name}] Circuit opened for ${provider.url} after ${provider.failureCount} failures.`,
              );
            }
            provider.state = 'open';
            provider.nextProbeAt = Date.now() + COOLDOWN_MS;
          }
        }

        if (isWrite) {
          throw error; // No retries for writes
        }

        if (!isServerError) {
          // If it's a client error like 404, there's no point retrying on another node.
          throw error;
        }

        // Apply exponential backoff with jitter if we have more attempts
        if (attempt < maxAttempts) {
          const backoff = Math.min(500 * Math.pow(2, attempt), 5000); // 1s, 2s, 4s...
          const jitter = Math.random() * 200;
          this.logger.warn(
            `[${this.name}] Retrying operation ${operationId} in ${Math.round(backoff + jitter)}ms (Attempt ${attempt}/${maxAttempts})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
        }
      }
    }

    throw lastError;
  }

  private getNextAvailableProvider() {
    for (const info of this.providers) {
      const { provider } = info;
      if (provider.state === 'closed') {
        return info;
      }
      if (provider.state === 'open' && Date.now() >= provider.nextProbeAt) {
        provider.state = 'half-open';
        return info;
      }
      if (provider.state === 'half-open') {
        return info;
      }
    }
    // If all are open and not ready for probe, fallback to primary and just try it anyway, or return null?
    // Let's return null to throw fast "All providers are currently failing".
    return null;
  }
}

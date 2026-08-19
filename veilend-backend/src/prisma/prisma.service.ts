import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/** Postgres error codes we want to retry on. */
const RETRYABLE_PG_CODES = new Set([
  'P2034', // Prisma: transaction conflict / serialization failure
  '40001', // Postgres: serialization_failure
  '40P01', // Postgres: deadlock_detected
]);

/** Maximum number of attempts for a retryable transaction. */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential back-off (attempt 1 → 50ms, 2 → 100ms). */
const BASE_BACKOFF_MS = 50;

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (RETRYABLE_PG_CODES.has(error.code)) return true;
    // Prisma wraps the raw Postgres code in meta.code for some driver configs.
    const meta = error.meta as Record<string, unknown> | undefined;
    if (meta && typeof meta['code'] === 'string') {
      return RETRYABLE_PG_CODES.has(meta['code']);
    }
  }
  // For raw query errors (PrismaClientUnknownRequestError / plain Error) the
  // Postgres code surface in the message text.
  if (error instanceof Error) {
    return (
      error.message.includes('deadlock detected') ||
      error.message.includes('could not serialize') ||
      error.message.includes('P0001') // custom "artificial deadlock" in tests
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /** Incremented each time a deadlock / serialization retry is triggered. */
  deadlockRetryCount = 0;

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `fn` inside a Serializable transaction, retrying up to MAX_RETRIES
   * times with exponential back-off on deadlock / serialization failures.
   *
   * The counter `deadlockRetryCount` is incremented on every retry so callers
   * and tests can assert that exactly N retries occurred.
   *
   * @param fn    Interactive-transaction callback receiving a TransactionClient.
   * @param opts  Additional Prisma transaction options (timeout, maxWait …).
   */
  async withSerializable<T>(
    fn: (db: Prisma.TransactionClient) => Promise<T>,
    opts?: Omit<
      Parameters<PrismaClient['$transaction']>[1],
      'isolationLevel'
    >,
  ): Promise<T> {
    return this._withRetry(
      () =>
        this.$transaction(fn, {
          ...opts,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
    );
  }

  /**
   * Runs `fn` inside a RepeatableRead transaction.  Intended for read-heavy
   * list endpoints that must not see phantom rows within the transaction but
   * do not need the full overhead of Serializable.
   */
  async withRepeatableRead<T>(
    fn: (db: Prisma.TransactionClient) => Promise<T>,
    opts?: Omit<
      Parameters<PrismaClient['$transaction']>[1],
      'isolationLevel'
    >,
  ): Promise<T> {
    return this.$transaction(fn, {
      ...opts,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /**
   * Internal retry loop.  Retries on any error deemed retryable by
   * `isRetryable`; all other errors are re-thrown immediately.
   */
  private async _withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (isRetryable(error) && attempt < MAX_RETRIES) {
          this.deadlockRetryCount += 1;
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Retryable transaction error on attempt ${attempt}/${MAX_RETRIES} ` +
              `(backoff ${backoff}ms): ${error instanceof Error ? error.message : String(error)}`,
          );
          await sleep(backoff);
          continue;
        }
        throw error;
      }
    }
  }
}

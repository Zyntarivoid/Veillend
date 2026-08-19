import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Horizon } from '@stellar/stellar-sdk';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ServiceResponse } from './types';
import { CircuitBreakerManager } from './retry-with-fallback';

@Injectable()
export class HorizonService implements OnModuleInit {
  private readonly logger = new Logger(HorizonService.name);
  private circuitBreaker!: CircuitBreakerManager<Horizon.Server>;

  constructor(private readonly configService: AppConfigService) {}

  onModuleInit() {
    const horizonUrls = this.configService.stellar.horizonUrls;
    this.logger.log(
      `Initializing Horizon Clients with URLs: ${horizonUrls.join(', ')}`,
    );

    this.circuitBreaker = new CircuitBreakerManager<Horizon.Server>(
      'Horizon',
      horizonUrls,
      (url) => new Horizon.Server(url),
    );

    // Asynchronously check connection so startup isn't blocked
    void this.validateConnection();
  }

  async loadAccount(accountId: string): Promise<Horizon.AccountResponse> {
    return this.circuitBreaker.execute(
      'loadAccount',
      (client) => client.loadAccount(accountId),
      { mode: 'read' },
    );
  }

  async getAccountTransactions(
    accountId: string,
    limit: number,
    order: 'asc' | 'desc' = 'desc',
  ): Promise<
    Horizon.ServerApi.CollectionPage<Horizon.ServerApi.TransactionRecord>
  > {
    return this.circuitBreaker.execute(
      'getAccountTransactions',
      (client) =>
        client
          .transactions()
          .forAccount(accountId)
          .limit(limit)
          .order(order)
          .call(),
      { mode: 'read' },
    );
  }

  async getRoot(): Promise<any> {
    return this.circuitBreaker.execute('getRoot', (client) => client.root(), {
      mode: 'read',
    });
  }

  async validateConnection(): Promise<boolean> {
    let allHealthy = false;
    for (const { client, provider } of this.circuitBreaker.getProviders()) {
      try {
        await client.root();
        provider.state = 'closed';
        provider.failureCount = 0;
        this.logger.log(`Horizon connection to ${provider.url} successful.`);
        allHealthy = true;
      } catch (error) {
        this.logger.warn(
          `Horizon connection to ${provider.url} failed.`,
          error,
        );
        provider.state = 'open';
      }
    }
    return allHealthy;
  }

  isHealthy(): boolean {
    return this.circuitBreaker
      .getProviders()
      .some((p) => p.provider.state !== 'open');
  }

  getLastError(): string | null {
    return this.isHealthy() ? null : 'All Horizon providers are unhealthy';
  }

  /**
   * Observable wrapper for checking connection status,
   * satisfying "safe, observable errors".
   */
  checkConnection$(): Observable<ServiceResponse<{ connected: boolean }>> {
    return from(this.validateConnection()).pipe(
      map((connected) => {
        if (connected) {
          return { success: true, data: { connected: true } };
        } else {
          return {
            success: false,
            data: { connected: false },
            error: { message: this.getLastError() || 'Connection failed' },
          };
        }
      }),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return of({
          success: false,
          data: { connected: false },
          error: { message, rawError: error },
        });
      }),
    );
  }
}

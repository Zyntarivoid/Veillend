import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Horizon } from '@stellar/stellar-sdk';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ServiceResponse } from './types';
import { ClsService } from 'nestjs-cls';
import { CORRELATION_ID_HEADER } from '../common/logging/correlation-id.util';

@Injectable()
export class HorizonService implements OnModuleInit {
  private readonly logger = new Logger(HorizonService.name);
  private client!: Horizon.Server;
  private healthy = false;
  private lastErrorMsg: string | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly cls: ClsService,
  ) {}

  onModuleInit() {
    const horizonUrl = this.configService.stellar.horizonUrl;
    this.logger.log(`Initializing Horizon Client with URL: ${horizonUrl}`);

    try {
      this.client = new Horizon.Server(horizonUrl);
      // Asynchronously check connection so startup isn't blocked
      void this.validateConnection();
    } catch (error) {
      this.healthy = false;
      this.lastErrorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Critical: Failed to initialize Horizon client instance: ${this.lastErrorMsg}`,
      );
    }
  }

  /**
   * Exposes the underlying Horizon Server instance.
   * Developers can access this if they need direct, advanced client methods.
   */
  getClient(): Horizon.Server {
    if (!this.client) {
      throw new Error('Horizon client is not initialized yet.');
    }
    return this.client;
  }

  /**
   * Returns fetch options (headers) for outbound calls, including the
   * current CLS correlation ID as X-Correlation-Id.
   */
  getOutboundFetchOptions(): RequestInit {
    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (correlationId) {
      headers[CORRELATION_ID_HEADER] = correlationId;
    }

    return { headers };
  }

  /**
   * Perform an outbound HTTP request to the Horizon endpoint,
   * automatically propagating the correlation ID header.
   */
  async horizonFetch(path: string): Promise<Response> {
    const url = `${this.configService.stellar.horizonUrl}/${path}`;
    return fetch(url, this.getOutboundFetchOptions());
  }

  /**
   * Perform an asynchronous connection validation check
   */
  async validateConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      // Query Horizon root endpoint
      await this.client.root();
      this.healthy = true;
      this.lastErrorMsg = null;
      this.logger.log(
        'Horizon client connected successfully to Stellar network.',
      );
      return true;
    } catch (error) {
      this.healthy = false;
      this.lastErrorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Horizon client connection check failed: ${this.lastErrorMsg}`,
      );
      return false;
    }
  }

  /**
   * Safe check for current health state
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Returns details of the last health check / connection error if any
   */
  getLastError(): string | null {
    return this.lastErrorMsg;
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
            error: { message: this.lastErrorMsg || 'Connection failed' },
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

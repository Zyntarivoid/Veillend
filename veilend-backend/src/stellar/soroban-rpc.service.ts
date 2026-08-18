import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { rpc } from '@stellar/stellar-sdk';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ServiceResponse } from './types';
import { ClsService } from 'nestjs-cls';
import { CORRELATION_ID_HEADER } from '../common/logging/correlation-id.util';

@Injectable()
export class SorobanRpcService implements OnModuleInit {
  private readonly logger = new Logger(SorobanRpcService.name);
  private client!: rpc.Server;
  private healthy = false;
  private lastErrorMsg: string | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly cls: ClsService,
  ) {}

  onModuleInit() {
    const sorobanRpcUrl = this.configService.stellar.sorobanRpcUrl;
    this.logger.log(
      `Initializing Soroban RPC Client with URL: ${sorobanRpcUrl}`,
    );

    try {
      this.client = new rpc.Server(sorobanRpcUrl);
      // Asynchronously check connection so startup isn't blocked
      void this.validateConnection();
    } catch (error) {
      this.healthy = false;
      this.lastErrorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Critical: Failed to initialize Soroban RPC client instance: ${this.lastErrorMsg}`,
      );
    }
  }

  /**
   * Exposes the underlying Soroban RPC Server instance.
   * Developers can access this if they need direct, advanced client methods.
   */
  getClient(): rpc.Server {
    if (!this.client) {
      throw new Error('Soroban RPC client is not initialized yet.');
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
   * Perform an outbound JSON-RPC call to the Soroban endpoint,
   * automatically propagating the correlation ID header.
   */
  async rpcCall<T = unknown>(method: string, params?: unknown): Promise<T> {
    const url = this.configService.stellar.sorobanRpcUrl;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      ...(params !== undefined ? { params } : {}),
    });

    const response = await fetch(url, {
      ...this.getOutboundFetchOptions(),
      method: 'POST',
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Soroban RPC call "${method}" failed: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as {
      result?: T;
      error?: { message: string };
    };
    if (json.error) {
      throw new Error(
        `Soroban RPC call "${method}" returned error: ${json.error.message}`,
      );
    }

    return json.result as T;
  }

  /**
   * Perform an asynchronous connection validation check
   */
  async validateConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      // Query Soroban RPC health endpoint
      const healthResponse = await this.client.getHealth();
      if (healthResponse && healthResponse.status === 'healthy') {
        this.healthy = true;
        this.lastErrorMsg = null;
        this.logger.log('Soroban RPC client connected and verified healthy.');
        return true;
      } else {
        this.healthy = false;
        this.lastErrorMsg = `Reported status: ${healthResponse?.status || 'unknown'}`;
        this.logger.warn(
          `Soroban RPC client connection check reported unhealthy: ${this.lastErrorMsg}`,
        );
        return false;
      }
    } catch (error) {
      this.healthy = false;
      this.lastErrorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Soroban RPC client connection check failed: ${this.lastErrorMsg}`,
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

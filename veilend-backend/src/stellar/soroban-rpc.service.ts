import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rpc } from '@stellar/stellar-sdk';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ServiceResponse } from './types';

@Injectable()
export class SorobanRpcService implements OnModuleInit {
  private readonly logger = new Logger(SorobanRpcService.name);
  private client!: rpc.Server;
  private healthy = false;
  private lastErrorMsg: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const sorobanRpcUrl = this.configService.get<string>(
      'stellar.sorobanRpcUrl',
      'https://soroban-testnet.stellar.org',
    );
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

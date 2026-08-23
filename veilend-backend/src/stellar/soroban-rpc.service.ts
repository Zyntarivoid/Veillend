import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  rpc,
  Account,
  Transaction,
  FeeBumpTransaction,
  Memo,
  MemoType,
  Operation,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

export interface SacValidationResult {
  symbol: string;
  name: string;
  decimals: number;
}
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ServiceResponse } from './types';
import { CircuitBreakerManager } from './retry-with-fallback';

@Injectable()
export class SorobanRpcService implements OnModuleInit {
  private readonly logger = new Logger(SorobanRpcService.name);
  private circuitBreaker!: CircuitBreakerManager<rpc.Server>;
  private networkPassphrase!: string;

  constructor(private readonly configService: AppConfigService) {}

  onModuleInit() {
    const sorobanRpcUrls = this.configService.stellar.sorobanRpcUrls;
    this.networkPassphrase = this.configService.stellar.networkPassphrase;

    this.logger.log(
      `Initializing Soroban RPC Clients with URLs: ${sorobanRpcUrls.join(', ')}`,
    );

    this.circuitBreaker = new CircuitBreakerManager<rpc.Server>(
      'SorobanRPC',
      sorobanRpcUrls,
      (url) => new rpc.Server(url, { allowHttp: true }),
    );

    // Asynchronously check connection so startup isn't blocked
    void this.validateConnection();
  }

  async getAccount(accountId: string): Promise<Account> {
    return this.circuitBreaker.execute(
      'getAccount',
      (client) => client.getAccount(accountId),
      { mode: 'read' },
    );
  }

  async getHealth(): Promise<rpc.Api.GetHealthResponse> {
    return this.circuitBreaker.execute(
      'getHealth',
      (client) => client.getHealth(),
      { mode: 'read' },
    );
  }

  async getLatestLedger(): Promise<rpc.Api.GetLatestLedgerResponse> {
    return this.circuitBreaker.execute(
      'getLatestLedger',
      (client) => client.getLatestLedger(),
      { mode: 'read' },
    );
  }

  async getEvents(
    request: rpc.Api.GetEventsRequest,
  ): Promise<rpc.Api.GetEventsResponse> {
    return this.circuitBreaker.execute(
      'getEvents',
      (client) => client.getEvents(request),
      { mode: 'read' },
    );
  }

  async getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse> {
    return this.circuitBreaker.execute(
      'getTransaction',
      (client) => client.getTransaction(hash),
      { mode: 'read' },
    );
  }

  /**
   * Simulates a single read-only contract invocation and returns its native
   * (scValToNative) result, or null when the simulation fails / returns no
   * result. Used for on-chain state reads (oracle prices, risk parameters)
   * that back the position-risk scanner; a null return signals "unavailable"
   * rather than an error so callers can degrade gracefully.
   */
  async simulateContractCall<T = unknown>(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<T | null> {
    const dummyAccount = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0',
    );

    try {
      const tx = new TransactionBuilder(dummyAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(new Contract(contractId).call(method, ...args))
        .setTimeout(0)
        .build();

      const sim = await this.circuitBreaker.execute(
        `simulate:${method}`,
        (client) => client.simulateTransaction(tx),
        { mode: 'read' },
      );

      if (rpc.Api.isSimulationError(sim) || !sim.result) {
        return null;
      }

      return scValToNative(sim.result.retval) as T;
    } catch (error) {
      this.logger.debug(
        `Read-only contract call ${method} on ${contractId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async sendTransaction(
    transaction: Transaction<Memo<MemoType>, Operation[]> | FeeBumpTransaction,
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.circuitBreaker.execute(
      'sendTransaction',
      (client) => client.sendTransaction(transaction),
      { mode: 'write' }, // Enforces 1 attempt max!
    );
  }

  async validateStellarAssetContract(
    address: string,
  ): Promise<SacValidationResult | null> {
    const dummyAccount = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0',
    );

    try {
      const contract = new Contract(address);
      const symbolOp = contract.call('symbol');
      const nameOp = contract.call('name');
      const decimalsOp = contract.call('decimals');

      const simSymbol = await this.circuitBreaker.execute(
        'simulateTransaction',
        (client) =>
          client.simulateTransaction(
            new TransactionBuilder(dummyAccount, {
              fee: BASE_FEE,
              networkPassphrase: this.networkPassphrase,
            })
              .addOperation(symbolOp)
              .setTimeout(0)
              .build(),
          ),
        { mode: 'read' },
      );

      const simName = await this.circuitBreaker.execute(
        'simulateTransaction',
        (client) =>
          client.simulateTransaction(
            new TransactionBuilder(dummyAccount, {
              fee: BASE_FEE,
              networkPassphrase: this.networkPassphrase,
            })
              .addOperation(nameOp)
              .setTimeout(0)
              .build(),
          ),
        { mode: 'read' },
      );

      const simDecimals = await this.circuitBreaker.execute(
        'simulateTransaction',
        (client) =>
          client.simulateTransaction(
            new TransactionBuilder(dummyAccount, {
              fee: BASE_FEE,
              networkPassphrase: this.networkPassphrase,
            })
              .addOperation(decimalsOp)
              .setTimeout(0)
              .build(),
          ),
        { mode: 'read' },
      );

      if (
        rpc.Api.isSimulationError(simSymbol) ||
        !simSymbol.result ||
        rpc.Api.isSimulationError(simName) ||
        !simName.result ||
        rpc.Api.isSimulationError(simDecimals) ||
        !simDecimals.result
      ) {
        return null;
      }

      const parseStr = (val: unknown) => {
        if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
          return Buffer.from(val).toString('utf8');
        }
        return String(val);
      };

      const symbolVal = scValToNative(simSymbol.result.retval) as unknown;
      const nameVal = scValToNative(simName.result.retval) as unknown;
      const decimalsVal = scValToNative(simDecimals.result.retval) as unknown;

      return {
        symbol: parseStr(symbolVal),
        name: parseStr(nameVal),
        decimals: Number(decimalsVal),
      };
    } catch (e) {
      this.logger.warn(`Failed to validate SAC ${address}: ${e}`);
      return null;
    }
  }

  async validateConnection(): Promise<boolean> {
    let allHealthy = false;
    for (const { client, provider } of this.circuitBreaker.getProviders()) {
      try {
        const health = await client.getHealth();
        if (health.status === 'healthy') {
          provider.state = 'closed';
          provider.failureCount = 0;
          this.logger.log(`Soroban RPC connection to ${provider.url} healthy.`);
          allHealthy = true;
        } else {
          throw new Error('RPC returned unhealthy status');
        }
      } catch (error) {
        this.logger.warn(
          `Soroban RPC connection to ${provider.url} failed.`,
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
    return this.isHealthy() ? null : 'All Soroban RPC providers are unhealthy';
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

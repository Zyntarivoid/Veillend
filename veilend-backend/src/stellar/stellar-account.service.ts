import { Injectable, Logger } from '@nestjs/common';
import { Horizon, Account } from '@stellar/stellar-sdk';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HorizonService } from './horizon.service';
import { SorobanRpcService } from './soroban-rpc.service';
import { ServiceResponse } from './types';

@Injectable()
export class StellarAccountService {
  private readonly logger = new Logger(StellarAccountService.name);

  constructor(
    private readonly horizonService: HorizonService,
    private readonly sorobanRpcService: SorobanRpcService,
  ) {}

  /**
   * Look up account details on Horizon.
   * Connection failures or non-existent accounts return safe ServiceResponse errors.
   */
  async lookupAccountHorizon(
    accountId: string,
  ): Promise<ServiceResponse<Horizon.AccountResponse>> {
    try {
      this.logger.log(`Looking up account on Horizon: ${accountId}`);
      const client = this.horizonService.getClient();
      const account = await client.loadAccount(accountId);
      return { success: true, data: account };
    } catch (error: unknown) {
      let status: number | undefined = undefined;
      if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if (
          'response' in errObj &&
          errObj.response &&
          typeof errObj.response === 'object'
        ) {
          const respObj = errObj.response as Record<string, unknown>;
          if ('status' in respObj && typeof respObj.status === 'number') {
            status = respObj.status;
          }
        } else if ('status' in errObj && typeof errObj.status === 'number') {
          status = errObj.status;
        }
      }
      let message = 'Error loading account from Horizon';
      if (error instanceof Error) {
        message = error.message;
      } else if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        message = error.message;
      }
      this.logger.warn(
        `Failed to lookup account ${accountId} on Horizon: ${message} (Status: ${status ?? 'unknown'})`,
      );
      return {
        success: false,
        error: {
          message,
          code: status ? status.toString() : 'HORIZON_ERROR',
          rawError: error,
        },
      };
    }
  }

  /**
   * Look up account details on Soroban RPC.
   * Connection failures or non-existent accounts return safe ServiceResponse errors.
   */
  async lookupAccountSoroban(
    accountId: string,
  ): Promise<ServiceResponse<Account>> {
    try {
      this.logger.log(`Looking up account on Soroban RPC: ${accountId}`);
      const client = this.sorobanRpcService.getClient();
      const account = await client.getAccount(accountId);
      return { success: true, data: account };
    } catch (error: unknown) {
      let message = 'Error loading account from Soroban RPC';
      if (error instanceof Error) {
        message = error.message;
      } else if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        message = error.message;
      }
      this.logger.warn(
        `Failed to lookup account ${accountId} on Soroban RPC: ${message}`,
      );
      return {
        success: false,
        error: {
          message,
          code: 'SOROBAN_RPC_ERROR',
          rawError: error,
        },
      };
    }
  }

  /**
   * Unified lookup that queries Horizon first, falling back to Soroban RPC.
   */
  async lookupAccount(accountId: string): Promise<
    ServiceResponse<{
      horizon?: Horizon.AccountResponse;
      soroban?: Account;
    }>
  > {
    const horizonRes = await this.lookupAccountHorizon(accountId);
    if (horizonRes.success && horizonRes.data) {
      return { success: true, data: { horizon: horizonRes.data } };
    }

    const sorobanRes = await this.lookupAccountSoroban(accountId);
    if (sorobanRes.success && sorobanRes.data) {
      return { success: true, data: { soroban: sorobanRes.data } };
    }

    return {
      success: false,
      error: {
        message: `Account ${accountId} could not be found on Horizon or Soroban RPC.`,
        code: 'ACCOUNT_NOT_FOUND',
        rawError: {
          horizon: horizonRes.error,
          soroban: sorobanRes.error,
        },
      },
    };
  }

  /**
   * RxJS Observable wrapper for Horizon lookup, satisfying "safe, observable errors".
   */
  lookupAccountHorizon$(
    accountId: string,
  ): Observable<ServiceResponse<Horizon.AccountResponse>> {
    return from(this.lookupAccountHorizon(accountId)).pipe(
      catchError((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unexpected Horizon lookup exception';
        this.logger.error(
          `Observable error in lookupAccountHorizon$: ${message}`,
        );
        return of({
          success: false,
          error: { message, code: 'OBSERVABLE_EXCEPTION', rawError: error },
        });
      }),
    );
  }

  /**
   * RxJS Observable wrapper for Soroban RPC lookup, satisfying "safe, observable errors".
   */
  lookupAccountSoroban$(
    accountId: string,
  ): Observable<ServiceResponse<Account>> {
    return from(this.lookupAccountSoroban(accountId)).pipe(
      catchError((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unexpected Soroban RPC lookup exception';
        this.logger.error(
          `Observable error in lookupAccountSoroban$: ${message}`,
        );
        return of({
          success: false,
          error: { message, code: 'OBSERVABLE_EXCEPTION', rawError: error },
        });
      }),
    );
  }

  /**
   * RxJS Observable wrapper for unified lookup.
   */
  lookupAccount$(accountId: string): Observable<
    ServiceResponse<{
      horizon?: Horizon.AccountResponse;
      soroban?: Account;
    }>
  > {
    return from(this.lookupAccount(accountId)).pipe(
      catchError((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Unexpected unified lookup exception';
        this.logger.error(`Observable error in lookupAccount$: ${message}`);
        return of({
          success: false,
          error: { message, code: 'OBSERVABLE_EXCEPTION', rawError: error },
        });
      }),
    );
  }
}

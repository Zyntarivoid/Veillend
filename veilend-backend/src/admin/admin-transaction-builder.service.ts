import { Injectable, Logger } from '@nestjs/common';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Memo,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { AdminActionType } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';

/**
 * Builds unsigned Soroban transactions for the privileged admin mutations
 * (configure asset, set oracle price, set minimum collateral ratio).
 *
 * The backend deliberately does NOT hold admin secret keys, so it returns an
 * unsigned XDR envelope that the client signs with Freighter and submits
 * itself. The envelope is deterministic for a given (nonce, actionId) pair:
 *
 *   - nonce: the admin account's current sequence number (fetched from RPC),
 *     which is baked into the transaction. Once the signed envelope is
 *     submitted, that sequence number is consumed, so the same XDR can never
 *     be re-submitted (replay-safe).
 *   - actionId: embedded in the transaction memo so every intent maps to a
 *     unique, auditable on-chain transaction.
 *
 * Method names match the actual Soroban functions in `veilend-soroban/src/lib.rs`.
 */
@Injectable()
export class AdminTransactionBuilderService {
  private readonly logger = new Logger(AdminTransactionBuilderService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly rpcService: SorobanRpcService,
  ) {}

  /**
   * Builds and returns the base64 unsigned transaction XDR for the given
   * admin action. Throws if the contract is not configured or the admin
   * account cannot be loaded from the network.
   */
  async buildActionXdr(
    actionId: string,
    adminAddress: string,
    action: AdminActionType,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const contractId = this.configService.indexer.contractId;
    if (!contractId) {
      throw new Error(
        'VeilLend contract ID is not configured (STELLAR_CONTRACT_ID)',
      );
    }

    // Source account + current sequence number (the replay-safe nonce).
    const account: Account = await this.rpcService.getAccount(adminAddress);

    const contract = new Contract(contractId);
    const adminScVal = new Address(adminAddress).toScVal();

    let operation: xdr.Operation<Operation.InvokeHostFunction>;
    switch (action) {
      case AdminActionType.CONFIGURE_ASSET:
        operation = contract.call(
          'propose_configure_asset',
          adminScVal,
          new Address(payload.assetContractId as string).toScVal(),
          nativeToScVal(Boolean(payload.supported), { type: 'bool' }),
        );
        break;
      case AdminActionType.SET_ORACLE_PRICE:
        operation = contract.call(
          'set_oracle_price',
          adminScVal,
          new Address(payload.assetContractId as string).toScVal(),
          nativeToScVal(BigInt(payload.price as number), { type: 'i128' }),
        );
        break;
      case AdminActionType.SET_MIN_COLLATERAL_RATIO:
        operation = contract.call(
          'propose_set_min_collateral_ratio',
          adminScVal,
          nativeToScVal(payload.minCollateralRatioBps, {
            type: 'u32',
          }),
        );
        break;
      default:
        throw new Error(`Unsupported admin action: ${String(action)}`);
    }

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.configService.stellar.networkPassphrase,
      // AdminAction ids are Prisma cuids (25 ASCII chars), which fit the
      // 28-byte Memo.text limit. The slice is a defensive guard only.
      memo: Memo.text(actionId.slice(0, 28)),
    })
      .addOperation(operation)
      .setTimeout(0)
      .build();

    return transaction.toXDR();
  }
}

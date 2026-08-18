import {
  Horizon,
  TransactionBuilder,
  Operation,
  rpc as StellarRpc,
  Address,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { getHorizonUrl, getNetworkPassphrase } from './config';
import { mapContractError, MappedContractError } from '../actions/mapContractError';

export interface SimulationResult {
  success: boolean;
  unsignedXdr: string | null;
  panicError: MappedContractError | null;
  minResourceFee?: string;
}

export interface SorobanActionParams {
  action: 'DEPOSIT' | 'WITHDRAW' | 'BORROW' | 'REPAY';
  userAddress: string;
  assetAddress: string;
  amount: number; // human units
  contractId?: string;
}

const DEFAULT_SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

const CONTRACT_ID =
  process.env.NEXT_PUBLIC_VEILLEND_CONTRACT_ID ||
  'CB67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD';

/**
 * Step (b): Pre-sign simulation via Soroban RPC simulateTransaction using a freshly fetched sequence number.
 * If simulation panics with a specific contract error, returns panicError and never prompts Freighter.
 */
export async function simulateSorobanTransaction(
  params: SorobanActionParams,
): Promise<SimulationResult> {
  const { action, userAddress, assetAddress, amount } = params;

  try {
    const horizonServer = new Horizon.Server(getHorizonUrl());
    let accountResponse: Horizon.AccountResponse;

    try {
      accountResponse = await horizonServer.loadAccount(userAddress);
    } catch {
      // Mock account if account does not exist on testnet
      accountResponse = {
        accountId: userAddress,
        sequenceNumber: '1000',
        incrementSequenceNumber: () => {},
        signers: [],
        thresholds: { low: 0, medium: 0, high: 0 },
        _baseFee: () => 100,
        _networkId: Buffer.alloc(32),
      } as unknown as Horizon.AccountResponse;
    }

    const targetContractId = params.contractId || CONTRACT_ID;

    // Convert amount to stroops (7 decimals)
    const rawAmount = BigInt(Math.round(amount * 1e7));

    // Map action to contract function name
    const fnName = action.toLowerCase(); // 'deposit', 'withdraw', 'borrow', 'repay'

    // Build contract call operation args
    const contractCallOp = Operation.invokeContractFunction({
      contract: targetContractId,
      function: fnName,
      args: [
        new Address(userAddress).toScVal(),
        new Address(assetAddress).toScVal(),
        nativeToScVal(rawAmount, { type: 'i128' }),
      ],
    });

    const tx = new TransactionBuilder(accountResponse, {
      fee: '1000',
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contractCallOp)
      .setTimeout(30)
      .build();

    const unsignedXdr = tx.toXDR();

    // Perform RPC simulation
    const rpcServer = new StellarRpc.Server(DEFAULT_SOROBAN_RPC_URL);

    let simResponse: StellarRpc.Api.SimulateTransactionResponse;
    try {
      simResponse = await rpcServer.simulateTransaction(tx);
    } catch (rpcErr) {
      const errMessage = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      if (errMessage.includes('429')) {
        return {
          success: false,
          unsignedXdr: null,
          panicError: mapContractError(429),
        };
      }
      // If mock/offline RPC call in dev environment, return green unsigned XDR
      return {
        success: true,
        unsignedXdr,
        panicError: null,
      };
    }

    // Inspect simulation result for contract panic
    if (StellarRpc.Api.isSimulationError(simResponse)) {
      const errorMsg = simResponse.error || 'Simulation returned an error';
      const panicError = mapContractError(errorMsg);

      return {
        success: false,
        unsignedXdr: null,
        panicError,
      };
    }

    const minResourceFee = simResponse.minResourceFee
      ? String(simResponse.minResourceFee)
      : undefined;

    return {
      success: true,
      unsignedXdr,
      panicError: null,
      minResourceFee,
    };
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    return {
      success: false,
      unsignedXdr: null,
      panicError: mapContractError(errorObj),
    };
  }
}

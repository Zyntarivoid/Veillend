import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

let starknet: any;
try {
  // Lazy require to avoid errors in environments without starknet
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  starknet = require('starknet');
} catch (e) {
  starknet = null;
}

@Injectable()
export class StarknetService {
  private readonly logger = new Logger(StarknetService.name);
  private readonly rpcUrl: string | undefined;

  constructor(private config: ConfigService) {
    this.rpcUrl = this.config.get<string>('STARKNET_RPC_URL');
  }

  getAbi(abiFileName: string): any {
    try {
      // load from src/abis
      const abisDir = path.join(process.cwd(), 'src', 'abis');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const abi = require(path.join(abisDir, abiFileName));
      return abi;
    } catch (e) {
      this.logger.warn(`ABI ${abiFileName} not found: ${e?.message}`);
      return null;
    }
  }

  // Returns a contract-like object. If starknet provider exists, returns a real Contract.
  async getContract(abiFileName: string, address: string) {
    const abi = this.getAbi(abiFileName);
    if (!abi) return null;

    if (!starknet || !this.rpcUrl) {
      this.logger.warn('starknet SDK or RPC URL not configured; returning ABI/address only');
      return { abi, address };
    }

    try {
      const provider = new starknet.Provider({ baseUrl: this.rpcUrl });
      const contract = new starknet.Contract(abi.abi ?? abi, address, provider);
      return contract;
    } catch (e) {
      this.logger.warn('Failed to instantiate Contract, returning ABI/address only: ' + e?.message);
      return { abi, address };
    }
  }

  // Instantiate a wallet account for signing transactions
  instantiateWalletAccount(nodeUrl: string, userWalletAddress: string, privateKey: string) {
    if (!starknet) throw new Error('starknet SDK not available');
    const { RpcProvider, Account } = starknet;
    const provider = new RpcProvider({ nodeUrl });
    const account = new Account(provider, userWalletAddress, privateKey);
    return { provider, account };
  }

  // Compile calldata using ABI and CallData helper
  compileCalldata(abi: any, entrypoint: string, args: any) {
    if (!starknet) throw new Error('starknet SDK not available');
    const { CallData } = starknet;
    const calldata = new CallData(abi).compile(entrypoint, args);
    return calldata;
  }

  // Execute a transaction using an account; waits for confirmation and returns receipt
  async executeTransaction(
    nodeUrl: string,
    userWalletAddress: string,
    privateKey: string,
    contractAddress: string,
    entrypoint: string,
    calldata: any,
    abi?: any,
  ) {
    if (!starknet) throw new Error('starknet SDK not available');

    const { account, provider } = this.instantiateWalletAccount(nodeUrl, userWalletAddress, privateKey);

    const call = {
      contractAddress,
      entrypoint,
      calldata,
    };

    const result = await account.execute(call);
    const txHash = result.transaction_hash;
    // wait for confirmation
    await provider.waitForTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    // Try to parse events if ABI provided and SDK exposes ABI helpers
    let parsedEvents: any[] | null = null;
    try {
      if (abi && starknet) {
        parsedEvents = [];
        const rawEvents = receipt?.events ?? [];
        for (const ev of rawEvents) {
          let parsed = null;
          try {
            if (starknet.abi && typeof starknet.abi.decodeEvent === 'function') {
              parsed = starknet.abi.decodeEvent(abi, ev);
            } else if (starknet.abi && typeof starknet.abi.decode_event === 'function') {
              parsed = starknet.abi.decode_event(abi, ev);
            } else if (starknet.utils && typeof starknet.utils.parseEvent === 'function') {
              parsed = starknet.utils.parseEvent(abi, ev);
            }
          } catch (e) {
            // ignore per-event parse failures
            this.logger.debug('event parse error: ' + (e?.message ?? e));
          }
          if (parsed) parsedEvents.push(parsed);
        }
      }
    } catch (e) {
      this.logger.warn('Event parsing failed: ' + (e?.message ?? e));
      parsedEvents = null;
    }

    return { txHash, receipt, events: parsedEvents ?? receipt?.events ?? [] };
  }
}


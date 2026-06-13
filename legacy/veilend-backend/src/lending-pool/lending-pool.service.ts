import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class LendingPoolService {
  private readonly logger = new Logger(LendingPoolService.name);
  private readonly abiFile = 'LendingPool_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getUserAccountData(contractAddress: string, userAddress: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.get_user_account_data === 'function') {
      try {
        return await contract.get_user_account_data(userAddress);
      } catch (e) {
        this.logger.warn('get_user_account_data failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write operations
  async deposit(contractAddress: string, asset: string, amount: any, onBehalfOf: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'deposit', {
        asset,
        amount,
        on_behalf_of: onBehalfOf,
      });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'deposit', calldata, abi);
    } catch (err: any) {
      this.logger.error('deposit failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async withdraw(contractAddress: string, asset: string, amount: any, to: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'withdraw', {
        asset,
        amount,
        to,
      });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'withdraw', calldata, abi);
    } catch (err: any) {
      this.logger.error('withdraw failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async borrow(contractAddress: string, asset: string, amount: any, interestRateMode: number, onBehalfOf: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'borrow', {
        asset,
        amount,
        interest_rate_mode: BigInt(interestRateMode),
        on_behalf_of: onBehalfOf,
      });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'borrow', calldata, abi);
    } catch (err: any) {
      this.logger.error('borrow failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async repay(contractAddress: string, asset: string, amount: any, interestRateMode: number, onBehalfOf: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'repay', {
        asset,
        amount,
        interest_rate_mode: BigInt(interestRateMode),
        on_behalf_of: onBehalfOf,
      });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'repay', calldata, abi);
    } catch (err: any) {
      this.logger.error('repay failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

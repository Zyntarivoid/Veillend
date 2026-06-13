import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class ReserveDataService {
  private readonly logger = new Logger(ReserveDataService.name);
  private readonly abiFile = 'ReserveData_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getReserveConfig(contractAddress: string, asset: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.get_reserve_config === 'function') {
      try {
        return await contract.get_reserve_config(asset);
      } catch (e) {
        this.logger.warn('get_reserve_config failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write helpers
  async setReserveConfig(contractAddress: string, asset: string, config: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_reserve_config', config);
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_reserve_config', calldata, abi);
    } catch (err: any) {
      this.logger.error('setReserveConfig failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setReserveState(contractAddress: string, asset: string, state: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_reserve_state', state);
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_reserve_state', calldata, abi);
    } catch (err: any) {
      this.logger.error('setReserveState failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setUserReserveData(contractAddress: string, user: string, asset: string, data: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_user_reserve_data', {
        user,
        asset,
        scaled_a_token_balance: data.scaled_a_token_balance,
        scaled_variable_debt: data.scaled_variable_debt,
        is_using_as_collateral: data.is_using_as_collateral,
      });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_user_reserve_data', calldata, abi);
    } catch (err: any) {
      this.logger.error('setUserReserveData failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

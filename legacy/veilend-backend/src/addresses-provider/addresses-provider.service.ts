import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class AddressesProviderService {
  private readonly logger = new Logger(AddressesProviderService.name);
  private readonly abiFile = 'AddressesProvider_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getAllAddresses(contractAddress: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.get_all_addresses === 'function') {
      try {
        return await contract.get_all_addresses();
      } catch (e) {
        this.logger.warn('get_all_addresses failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write helpers for updating addresses
  async setLendingPool(contractAddress: string, newAddress: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_lending_pool', { new_address: newAddress });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_lending_pool', calldata, abi);
    } catch (err: any) {
      this.logger.error('setLendingPool failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setShieldedPool(contractAddress: string, newAddress: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_shielded_pool', { new_address: newAddress });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_shielded_pool', calldata, abi);
    } catch (err: any) {
      this.logger.error('setShieldedPool failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setPriceOracle(contractAddress: string, newAddress: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_price_oracle', { new_address: newAddress });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_price_oracle', calldata, abi);
    } catch (err: any) {
      this.logger.error('setPriceOracle failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

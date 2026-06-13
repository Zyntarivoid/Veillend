import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class PriceOracleService {
  private readonly logger = new Logger(PriceOracleService.name);
  private readonly abiFile = 'PriceOracle_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getPrice(contractAddress: string, asset: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.get_price === 'function') {
      try {
        return await contract.get_price(asset);
      } catch (e) {
        this.logger.warn('get_price failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write helpers
  async setPrice(contractAddress: string, asset: string, price: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_price', { asset, price });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_price', calldata, abi);
    } catch (err: any) {
      this.logger.error('setPrice failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setPrices(contractAddress: string, assets: any[], prices: any[]) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_prices', { assets, prices });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_prices', calldata, abi);
    } catch (err: any) {
      this.logger.error('setPrices failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setPriceSource(contractAddress: string, asset: string, source: string) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_price_source', { asset, source });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_price_source', calldata, abi);
    } catch (err: any) {
      this.logger.error('setPriceSource failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setStalenessThreshold(contractAddress: string, newThreshold: number) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_staleness_threshold', { new_threshold: BigInt(newThreshold) });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_staleness_threshold', calldata, abi);
    } catch (err: any) {
      this.logger.error('setStalenessThreshold failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

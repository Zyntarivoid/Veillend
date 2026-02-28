import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class InterestTokenService {
  private readonly logger = new Logger(InterestTokenService.name);
  private readonly abiFile = 'InterestToken_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getScaledBalance(contractAddress: string, user: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.scaled_balance_of === 'function') {
      try {
        return await contract.scaled_balance_of(user);
      } catch (e) {
        this.logger.warn('scaled_balance_of failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write helpers
  async mint(contractAddress: string, to: string, amount: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, '_mint', { on_behalf_of: to, amount });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, '_mint', calldata, abi);
    } catch (err: any) {
      this.logger.error('mint failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async burn(contractAddress: string, from: string, amount: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, '_burn', { from, amount });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, '_burn', calldata, abi);
    } catch (err: any) {
      this.logger.error('burn failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setLiquidityIndex(contractAddress: string, newIndex: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'set_liquidity_index', { new_index: newIndex });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_liquidity_index', calldata, abi);
    } catch (err: any) {
      this.logger.error('setLiquidityIndex failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);
  private readonly abiFile = 'VEILENDGOV_ABI.json';

  constructor(private starknet: StarknetService) {}

  async getContract(address: string) {
    return this.starknet.getContract(this.abiFile, address);
  }

  async getTotalSupply(contractAddress: string) {
    const contract: any = await this.getContract(contractAddress);
    if (!contract) return null;
    if (typeof contract.totalSupply === 'function') {
      try {
        return await contract.totalSupply();
      } catch (e) {
        this.logger.warn('totalSupply failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // Write helpers
  async mint(contractAddress: string, to: string, amount: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'mint', { recipient: to, amount });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'mint', calldata, abi);
    } catch (err: any) {
      this.logger.error('mint failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async burn(contractAddress: string, from: string, amount: any) {
    try {
      const abi = this.starknet.getAbi(this.abiFile);
      const calldata = this.starknet.compileCalldata(abi, 'burn', { account: from, amount });
      return await this.starknet.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'burn', calldata, abi);
    } catch (err: any) {
      this.logger.error('burn failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

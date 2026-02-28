import { Injectable, Logger } from '@nestjs/common';
import { StarknetService } from '../starknet/starknet.service';

@Injectable()
export class ShieldedPoolService {
  private readonly logger = new Logger(ShieldedPoolService.name);
  private readonly abiFile = 'ShieldedPool_ABI.json';

  constructor(private starknetService: StarknetService) {}

  async getContract(address: string) {
    return this.starknetService.getContract(this.abiFile, address);
  }

  async getCommitment(address: string, commitment: string) {
    const contract: any = await this.getContract(address);
    if (!contract) return null;

    if (typeof contract.get_commitment === 'function') {
      try {
        const res = await contract.get_commitment(commitment);
        return res;
      } catch (e) {
        this.logger.warn('Contract call get_commitment failed: ' + e.message);
        return null;
      }
    }

    // ABI-only fallback
    return { commitment, info: 'ABI loaded; RPC not configured' };
  }

  async isNullifierUsed(address: string, nullifier: string) {
    const contract: any = await this.getContract(address);
    if (!contract) return null;
    if (typeof contract.is_nullifier_used === 'function') {
      try {
        return await contract.is_nullifier_used(nullifier);
      } catch (e) {
        this.logger.warn('is_nullifier_used call failed: ' + e.message);
        return null;
      }
    }
    return { nullifier, info: 'ABI loaded; RPC not configured' };
  }

  async getMerkleRoot(address: string) {
    const contract: any = await this.getContract(address);
    if (!contract) return null;
    if (typeof contract.get_merkle_root === 'function') {
      try {
        return await contract.get_merkle_root();
      } catch (e) {
        this.logger.warn('get_merkle_root call failed: ' + e.message);
        return null;
      }
    }
    return { info: 'ABI loaded; RPC not configured' };
  }

  // ------------ Write / Admin actions ------------
  async depositShielded(contractAddress: string, commitment: string, asset: string, amount: any) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'deposit_shielded', {
        commitment,
        asset,
        amount,
      });

      const res = await this.starknetService.executeTransaction(
        process.env.ADMIN_NODE_URL!,
        process.env.ADMIN_WALLET_ADDRESS!,
        process.env.ADMIN_PRIVATE_KEY!,
        contractAddress,
        'deposit_shielded',
        calldata,
        abi,
      );

      return res;
    } catch (err: any) {
      this.logger.error('depositShielded failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async withdrawShielded(contractAddress: string, nullifier: string, recipient: string, asset: string, amount: any, merkle_proof: any[], path_indices: any[]) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'withdraw_shielded', {
        nullifier,
        recipient,
        asset,
        amount,
        merkle_proof,
        path_indices,
      });

      const res = await this.starknetService.executeTransaction(
        process.env.ADMIN_NODE_URL!,
        process.env.ADMIN_WALLET_ADDRESS!,
        process.env.ADMIN_PRIVATE_KEY!,
        contractAddress,
        'withdraw_shielded',
        calldata,
        abi,
      );

      return res;
    } catch (err: any) {
      this.logger.error('withdrawShielded failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async addSupportedAsset(contractAddress: string, asset: string) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'add_supported_asset', { asset });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'add_supported_asset', calldata, abi);
    } catch (err: any) {
      this.logger.error('addSupportedAsset failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async removeSupportedAsset(contractAddress: string, asset: string) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'remove_supported_asset', { asset });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'remove_supported_asset', calldata, abi);
    } catch (err: any) {
      this.logger.error('removeSupportedAsset failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setDepositLimits(contractAddress: string, min_amount: any, max_amount: any) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'set_deposit_limits', { min_amount, max_amount });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_deposit_limits', calldata, abi);
    } catch (err: any) {
      this.logger.error('setDepositLimits failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setDepositFee(contractAddress: string, fee_basis_points: number) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'set_deposit_fee', { fee_basis_points });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_deposit_fee', calldata, abi);
    } catch (err: any) {
      this.logger.error('setDepositFee failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async setFeeCollector(contractAddress: string, new_collector: string) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'set_fee_collector', { new_collector });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'set_fee_collector', calldata, abi);
    } catch (err: any) {
      this.logger.error('setFeeCollector failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }

  async emergencyWithdraw(contractAddress: string, asset: string, recipient: string, amount: any) {
    try {
      const abi = this.starknetService.getAbi(this.abiFile);
      const calldata = this.starknetService.compileCalldata(abi, 'emergency_withdraw', { asset, recipient, amount });
      return await this.starknetService.executeTransaction(process.env.ADMIN_NODE_URL!, process.env.ADMIN_WALLET_ADDRESS!, process.env.ADMIN_PRIVATE_KEY!, contractAddress, 'emergency_withdraw', calldata, abi);
    } catch (err: any) {
      this.logger.error('emergencyWithdraw failed: ' + (err?.message ?? err));
      return { error: err?.message ?? String(err) };
    }
  }
}

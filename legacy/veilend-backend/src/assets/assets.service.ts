import { Injectable } from '@nestjs/common';

@Injectable()
export class AssetsService {
  private readonly assets = [
    { id: '1', name: 'Ethereum', symbol: 'ETH', icon: 'logo-electron', apy: 4.5, balance: '2.5' },
    { id: '2', name: 'USDC', symbol: 'USDC', icon: 'cash-outline', apy: 8.2, balance: '1,250.00' },
    { id: '3', name: 'Starknet', symbol: 'STRK', icon: 'layers-outline', apy: 12.5, balance: '500.00' },
    { id: '4', name: 'Bitcoin', symbol: 'WBTC', icon: 'logo-bitcoin', apy: 3.8, balance: '0.15' },
  ];

  findAll() {
    return this.assets;
  }
}

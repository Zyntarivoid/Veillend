import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigureAssetDto } from './dto/configure-asset.dto';
import { SetOraclePriceDto } from './dto/set-oracle-price.dto';
import { SetMinCollateralRatioDto } from './dto/set-min-collateral-ratio.dto';
import { AddAdminDto } from './dto/add-admin.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async addAdmin(dto: AddAdminDto) {
    return await this.prisma.admin.create({
      data: {
        walletAddress: dto.walletAddress,
      },
    });
  }

  async removeAdmin(walletAddress: string) {
    return await this.prisma.admin.delete({
      where: { walletAddress },
    });
  }

  async listAdmins() {
    return await this.prisma.admin.findMany();
  }

  configureAsset(dto: ConfigureAssetDto) {
    // Placeholder: Actual contract interaction would go here
    return {
      success: true,
      message: 'Asset configuration updated',
      data: dto,
    };
  }

  setOraclePrice(dto: SetOraclePriceDto) {
    // Placeholder: Actual contract interaction would go here
    return {
      success: true,
      message: 'Oracle price set',
      data: dto,
    };
  }

  setMinCollateralRatio(dto: SetMinCollateralRatioDto) {
    // Placeholder: Actual contract interaction would go here
    return {
      success: true,
      message: 'Min collateral ratio updated',
      data: dto,
    };
  }
}

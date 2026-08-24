import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MarketView {
  assetId: string;
  totalSupplied: string;
  totalBorrowed: string;
  availableLiquidity: string;
  utilizationBps: number;
  borrowApy: number;
  supplyApy: number;
  reserveFactorBps: number;
  protocolFees: string;
  lastAccrualAt: string;
  isStale: boolean;
}

const SECONDS_PER_YEAR = 31536000;
const BPS_SCALE = 10000;

@Injectable()
export class MarketsService {
  constructor(private readonly prisma: PrismaService) {}

  public computeApy(annualRateBps: number): number {
    const ratePerSecond = annualRateBps / (BPS_SCALE * SECONDS_PER_YEAR);
    return Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;
  }

  public computeMarket(state: any, params: any): MarketView {
    const totalSupplied = Number(state.totalSupplied);
    const totalBorrowed = Number(state.totalBorrowed);
    
    let utilizationBps = 0;
    if (totalSupplied > 0) {
      utilizationBps = Math.floor((totalBorrowed * BPS_SCALE) / totalSupplied);
      if (utilizationBps > BPS_SCALE) utilizationBps = BPS_SCALE;
    }

    const base = params?.baseRateBps ?? 0;
    const kink = params?.kinkUtilBps ?? 8000;
    const slope1 = params?.slope1Bps ?? 0;
    const slope2 = params?.slope2Bps ?? 0;
    const reserveFactor = params?.reserveFactorBps ?? 1000;

    let borrowRateAnnualBps = 0;
    if (utilizationBps <= kink) {
      borrowRateAnnualBps = base + (slope1 * utilizationBps) / BPS_SCALE;
    } else {
      borrowRateAnnualBps =
        base + (slope1 * kink) / BPS_SCALE + (slope2 * (utilizationBps - kink)) / BPS_SCALE;
    }

    const supplyRateAnnualBps =
      (borrowRateAnnualBps * utilizationBps * Math.max(0, BPS_SCALE - reserveFactor)) /
      (BPS_SCALE * BPS_SCALE);

    const borrowApy = this.computeApy(borrowRateAnnualBps);
    const supplyApy = this.computeApy(supplyRateAnnualBps);
    
    const availableLiquidity = BigInt(state.totalSupplied) - BigInt(state.totalBorrowed);
    
    // Configurable staleness window, default 24h
    const isStale = Date.now() - new Date(state.lastAccrualAt).getTime() > 24 * 60 * 60 * 1000;

    return {
      assetId: state.assetId,
      totalSupplied: state.totalSupplied.toString(),
      totalBorrowed: state.totalBorrowed.toString(),
      availableLiquidity: (availableLiquidity > 0n ? availableLiquidity : 0n).toString(),
      utilizationBps,
      borrowApy,
      supplyApy,
      reserveFactorBps: reserveFactor,
      protocolFees: state.protocolFees.toString(),
      lastAccrualAt: state.lastAccrualAt.toISOString(),
      isStale,
    };
  }

  async getMarkets(): Promise<MarketView[]> {
    const states = await this.prisma.assetInterestState.findMany({
      include: { asset: { include: { interestParams: true } } },
    });

    return states.map((state) => this.computeMarket(state, state.asset?.interestParams));
  }

  async getMarket(assetId: string): Promise<MarketView> {
    const state = await this.prisma.assetInterestState.findUnique({
      where: { assetId },
      include: { asset: { include: { interestParams: true } } },
    });

    if (!state) {
      throw new NotFoundException(`Market for asset ${assetId} not found`);
    }

    return this.computeMarket(state, state.asset?.interestParams);
  }
}

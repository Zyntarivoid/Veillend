import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetResponseDto } from './dto/asset-response.dto';
import { plainToInstance } from 'class-transformer';

/**
 * Simple in-memory cache with TTL.
 * Avoids external dependencies (Redis, etc.) for read-heavy, rarely-changing data.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  /** Cache TTL: 60 seconds */
  private readonly CACHE_TTL_MS = 60_000;

  private assetsCache: CacheEntry<AssetResponseDto[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all assets with metadata.
   * Results are cached in-memory for CACHE_TTL_MS to reduce DB load.
   */
  async findAll(): Promise<AssetResponseDto[]> {
    const now = Date.now();

    if (this.assetsCache && this.assetsCache.expiresAt > now) {
      return this.assetsCache.data;
    }

    this.logger.debug('Cache miss - fetching assets from database');

    const assets = await this.prisma.asset.findMany({
      orderBy: [{ isSupported: 'desc' }, { code: 'asc' }],
    });

    const dtos = plainToInstance(AssetResponseDto, assets, {
      excludeExtraneousValues: true,
    });

    this.assetsCache = {
      data: dtos,
      expiresAt: now + this.CACHE_TTL_MS,
    };

    return dtos;
  }

  /**
   * Returns only supported (configured) assets.
   */
  async findSupported(): Promise<AssetResponseDto[]> {
    const all = await this.findAll();
    return all.filter((a) => a.isSupported);
  }

  /**
   * Returns a single asset by its UUID, code, or contractId.
   */
  async findOne(id: string): Promise<AssetResponseDto> {
    const all = await this.findAll();
    const asset = all.find((a) => a.code === id || a.contractId === id);

    if (!asset) {
      const dbAsset = await this.prisma.asset.findUnique({ where: { id } });
      if (!dbAsset) {
        throw new NotFoundException(`Asset not found: ${id}`);
      }
      return plainToInstance(AssetResponseDto, dbAsset, {
        excludeExtraneousValues: true,
      });
    }

    return asset;
  }

  /**
   * Invalidate the asset cache (e.g. after admin configures a new asset).
   */
  invalidateCache(): void {
    this.assetsCache = null;
    this.logger.debug('Asset cache invalidated');
  }
}

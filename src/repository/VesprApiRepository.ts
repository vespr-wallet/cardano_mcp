import { LRUCache } from "lru-cache";
import { VesprApiClient } from "../api/VesprApiClient.js";
import {
  AdaSpotPriceResponse,
  TokenInfoResponse,
  TokenChartResponse,
  ChartPeriod,
  TransactionHistoryResponse,
  WalletDetailedResponse,
  TrendingTokensResponse,
  TrendingPeriod,
  StakingInfoResponse,
  AdaHandleOwnerResponse,
  AssetMetadataResponse,
  AssetSummaryResponse,
  PoolInfoResponse,
} from "../types/api/schemas.js";
import { CryptoCurrency, FiatCurrency, SupportedCurrency } from "../types/currency.js";

class VesprApiRepository {
  private readonly client: VesprApiClient = new VesprApiClient();
  private readonly spotPriceCache = new LRUCache<FiatCurrency, AdaSpotPriceResponse>({
    max: 100,
    ttl: 1000 * 60 * 10, // 10 minutes
  });

  private readonly tokenInfoCache = new LRUCache<string, TokenInfoResponse>({
    max: 500,
    ttl: 1000 * 60 * 60 * 2, // 2 hours
  });

  private readonly trendingCache = new LRUCache<string, TrendingTokensResponse>({
    max: 50,
    ttl: 1000 * 60 * 5, // 5 minutes (volatile data)
  });

  private readonly handleCache = new LRUCache<string, AdaHandleOwnerResponse>({
    max: 200,
    ttl: 1000 * 60 * 10, // 10 minutes (handles rarely change)
  });

  private readonly assetMetadataCache = new LRUCache<string, AssetMetadataResponse>({
    max: 500,
    ttl: 1000 * 60 * 60, // 1 hour (metadata rarely changes)
  });

  private readonly poolInfoCache = new LRUCache<string, PoolInfoResponse>({
    max: 100,
    ttl: 1000 * 60 * 30, // 30 minutes (pool data changes per epoch)
  });

  async getAdaSpotPrice(currency: SupportedCurrency): Promise<AdaSpotPriceResponse> {
    if (currency === CryptoCurrency.ADA) {
      return {
        currency: CryptoCurrency.ADA,
        spot: "1",
        spot1hAgo: null,
        spot24hAgo: null,
      };
    }
    const cached = this.spotPriceCache.get(currency);
    if (cached) {
      return cached;
    }
    const spotPrice = await this.client.getAdaSpotPrice(currency);
    this.spotPriceCache.set(currency, spotPrice);
    return spotPrice;
  }

  async getDetailedWallet(addressBech32: string): Promise<WalletDetailedResponse> {
    return this.client.fetchWalletDetailed(addressBech32);
  }

  async getTransactionHistory(address: string, toBlock?: number): Promise<TransactionHistoryResponse> {
    return this.client.fetchTransactionHistory(address, toBlock);
  }

  async getTokenInfo(unit: string, currency: SupportedCurrency = FiatCurrency.USD): Promise<TokenInfoResponse> {
    const cacheKey = `${unit}:${currency}`;
    const cached = this.tokenInfoCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await this.client.fetchTokenInfo(unit, currency);
    this.tokenInfoCache.set(cacheKey, result);
    return result;
  }

  async getTokenChart(
    unit: string,
    period: ChartPeriod = "24H",
    currency: SupportedCurrency = CryptoCurrency.ADA,
  ): Promise<TokenChartResponse> {
    return this.client.fetchTokenChart(unit, period, currency);
  }

  async getTrendingTokens(
    currency: SupportedCurrency = FiatCurrency.USD,
    period?: TrendingPeriod,
  ): Promise<TrendingTokensResponse> {
    const cacheKey = `${currency}:${period || "default"}`;
    const cached = this.trendingCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await this.client.fetchTrendingTokens(currency, period);
    this.trendingCache.set(cacheKey, result);
    return result;
  }

  async getStakingInfo(address: string): Promise<StakingInfoResponse> {
    // No caching - staking info is epoch-dependent and changes frequently
    return this.client.fetchStakingInfo(address);
  }

  async resolveAdaHandle(handle: string): Promise<AdaHandleOwnerResponse> {
    // Normalize for cache key
    const normalizedHandle = handle.startsWith("$") ? handle.slice(1) : handle;
    const cacheKey = normalizedHandle.toLowerCase();

    const cached = this.handleCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await this.client.resolveAdaHandle(handle);
    this.handleCache.set(cacheKey, result);
    return result;
  }

  async getAssetMetadata(unit: string): Promise<AssetMetadataResponse> {
    const cached = this.assetMetadataCache.get(unit);
    if (cached) {
      return cached;
    }
    const result = await this.client.fetchAssetMetadata(unit);
    this.assetMetadataCache.set(unit, result);
    return result;
  }

  async getAssetSummary(units: string[]): Promise<AssetSummaryResponse> {
    // No caching - batch results vary
    return this.client.fetchAssetSummary(units);
  }

  async getPoolInfo(poolId: string): Promise<PoolInfoResponse> {
    const cached = this.poolInfoCache.get(poolId);
    if (cached) {
      return cached;
    }
    const result = await this.client.fetchPoolInfo(poolId);
    this.poolInfoCache.set(poolId, result);
    return result;
  }
}

export default new VesprApiRepository();

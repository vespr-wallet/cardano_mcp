import { config } from "../config.js";
import { FetchApiClient } from "../utils/api/FetchApiClient.js";
import { getCurrentApiKey } from "../utils/apiKeyContext.js";
import {
  WalletDetailedResponseSchema,
  AdaSpotPriceResponseSchema,
  TransactionHistoryResponseSchema,
  StakingInfoResponseSchema,
  TokenInfoResponseSchema,
  TokenChartResponseSchema,
  TrendingTokensResponseSchema,
  AdaHandleOwnerResponseSchema,
  AssetMetadataResponseSchema,
  AssetSummaryResponseSchema,
  PoolInfoResponseSchema,
  type WalletDetailedResponse,
  type AdaSpotPriceResponse,
  type TransactionHistoryResponse,
  type StakingInfoResponse,
  type TokenInfoResponse,
  type TokenChartResponse,
  type ChartPeriod,
  type TrendingTokensResponse,
  type TrendingPeriod,
  type AdaHandleOwnerResponse,
  type AssetMetadataResponse,
  type AssetSummaryResponse,
  type PoolInfoResponse,
} from "../types/api/schemas.js";
import { FiatCurrency, CryptoCurrency } from "../types/currency.js";

export class VesprApiClient {
  private getClient(): FetchApiClient {
    const apiKey = getCurrentApiKey() || config.apiKey;
    if (!apiKey) {
      throw new Error(
        "VESPR API key is required. Provide it via X-API-Key header (HTTP) or VESPR_API_KEY environment variable (stdio/npx).",
      );
    }
    return new FetchApiClient({
      baseUrl: config.apiBaseUrl,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
    });
  }

  async fetchWalletDetailed(address: string): Promise<WalletDetailedResponse> {
    return this.getClient().post({
      path: "/v7/wallet/detailed",
      body: { address },
      schema: WalletDetailedResponseSchema,
      context: `wallet(${address.slice(0, 15)}...)`,
    });
  }

  async getAdaSpotPrice(currency: FiatCurrency): Promise<AdaSpotPriceResponse> {
    return this.getClient().get({
      path: `/v5/ada/spot?currency=${encodeURIComponent(currency)}`,
      schema: AdaSpotPriceResponseSchema,
      context: `ada-spot(${currency})`,
    });
  }

  async fetchTransactionHistory(address: string, toBlock?: number): Promise<TransactionHistoryResponse> {
    return this.getClient().post({
      path: "/v4/wallet/transactions",
      body: { address, maybe_to_block: toBlock },
      schema: TransactionHistoryResponseSchema,
      context: `transactions(${address.slice(0, 15)}...)`,
    });
  }

  async fetchStakingInfo(address: string): Promise<StakingInfoResponse> {
    return this.getClient().post({
      path: "/v5/wallet/rewards/staking/info",
      body: { address },
      schema: StakingInfoResponseSchema,
      context: `staking(${address.slice(0, 15)}...)`,
    });
  }

  async fetchTokenInfo(
    unit: string,
    currency: FiatCurrency | CryptoCurrency = FiatCurrency.USD,
  ): Promise<TokenInfoResponse> {
    return this.getClient().get({
      path: `/v1/token/${encodeURIComponent(unit)}/info?currency=${encodeURIComponent(currency)}`,
      schema: TokenInfoResponseSchema,
      context: `token-info(${unit.slice(0, 20)}...)`,
    });
  }

  async fetchTokenChart(
    unit: string,
    period: ChartPeriod = "24H",
    currency: FiatCurrency | CryptoCurrency = CryptoCurrency.ADA,
  ): Promise<TokenChartResponse> {
    const params = new URLSearchParams({
      period,
      currency,
    });
    return this.getClient().get({
      path: `/v1/token/${encodeURIComponent(unit)}/chart?${params}`,
      schema: TokenChartResponseSchema,
      context: `token-chart(${unit.slice(0, 20)}...)`,
    });
  }

  async fetchTrendingTokens(
    currency: FiatCurrency | CryptoCurrency,
    period?: TrendingPeriod,
  ): Promise<TrendingTokensResponse> {
    const params = new URLSearchParams({ currency });
    if (period) params.set("period", period);

    return this.getClient().get({
      path: `/v1/tokens/explore/trending?${params}`,
      schema: TrendingTokensResponseSchema,
      context: `trending-tokens(${currency})`,
    });
  }

  async resolveAdaHandle(handle: string): Promise<AdaHandleOwnerResponse> {
    // Normalize handle - remove $ prefix if present
    const normalizedHandle = handle.startsWith("$") ? handle.slice(1) : handle;

    return this.getClient().post({
      path: "/v4/asset/handle_owner",
      body: { handle: normalizedHandle.toLowerCase() },
      schema: AdaHandleOwnerResponseSchema,
      context: `handle($${normalizedHandle})`,
    });
  }

  async fetchAssetMetadata(unit: string): Promise<AssetMetadataResponse> {
    return this.getClient().get({
      path: `/v4/asset/${encodeURIComponent(unit)}/metadata`,
      schema: AssetMetadataResponseSchema,
      context: `asset-metadata(${unit.slice(0, 20)}...)`,
    });
  }

  async fetchAssetSummary(units: string[]): Promise<AssetSummaryResponse> {
    return this.getClient().post({
      path: "/v4/asset/summary",
      body: { assets_unit: units },
      schema: AssetSummaryResponseSchema,
      context: `asset-summary(${units.length} assets)`,
    });
  }

  async fetchPoolInfo(poolId: string): Promise<PoolInfoResponse> {
    return this.getClient().post({
      path: "/v4/pool/info",
      body: { pool_id_bech_32: poolId },
      schema: PoolInfoResponseSchema,
      context: `pool-info(${poolId.slice(0, 20)}...)`,
    });
  }
}

export default new VesprApiClient();

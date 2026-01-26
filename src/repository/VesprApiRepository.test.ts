import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import VesprApiRepository from "./VesprApiRepository.js";
import { VesprApiClient } from "../api/VesprApiClient.js";
import { CryptoCurrency, FiatCurrency } from "../types/currency.js";
import type {
  AdaSpotPriceResponse,
  WalletDetailedResponse,
  TransactionHistoryResponse,
  TokenInfoResponse,
  TokenChartResponse,
  TrendingTokensResponse,
  StakingInfoResponse,
  AdaHandleOwnerResponse,
  AssetMetadataResponse,
  AssetSummaryResponse,
  PoolInfoResponse,
} from "../types/api/schemas.js";

describe("VesprApiRepository", () => {
  // Spy on VesprApiClient prototype methods
  let getAdaSpotPriceSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.getAdaSpotPrice>;
  let fetchWalletDetailedSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchWalletDetailed>;
  let fetchTransactionHistorySpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchTransactionHistory>;
  let fetchTokenInfoSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchTokenInfo>;
  let fetchTokenChartSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchTokenChart>;
  let fetchTrendingTokensSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchTrendingTokens>;
  let fetchStakingInfoSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchStakingInfo>;
  let resolveAdaHandleSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.resolveAdaHandle>;
  let fetchAssetMetadataSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchAssetMetadata>;
  let fetchAssetSummarySpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchAssetSummary>;
  let fetchPoolInfoSpy: jest.SpiedFunction<typeof VesprApiClient.prototype.fetchPoolInfo>;

  beforeEach(() => {
    // Setup spies on all client methods
    getAdaSpotPriceSpy = jest.spyOn(VesprApiClient.prototype, "getAdaSpotPrice");
    fetchWalletDetailedSpy = jest.spyOn(VesprApiClient.prototype, "fetchWalletDetailed");
    fetchTransactionHistorySpy = jest.spyOn(VesprApiClient.prototype, "fetchTransactionHistory");
    fetchTokenInfoSpy = jest.spyOn(VesprApiClient.prototype, "fetchTokenInfo");
    fetchTokenChartSpy = jest.spyOn(VesprApiClient.prototype, "fetchTokenChart");
    fetchTrendingTokensSpy = jest.spyOn(VesprApiClient.prototype, "fetchTrendingTokens");
    fetchStakingInfoSpy = jest.spyOn(VesprApiClient.prototype, "fetchStakingInfo");
    resolveAdaHandleSpy = jest.spyOn(VesprApiClient.prototype, "resolveAdaHandle");
    fetchAssetMetadataSpy = jest.spyOn(VesprApiClient.prototype, "fetchAssetMetadata");
    fetchAssetSummarySpy = jest.spyOn(VesprApiClient.prototype, "fetchAssetSummary");
    fetchPoolInfoSpy = jest.spyOn(VesprApiClient.prototype, "fetchPoolInfo");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getAdaSpotPrice", () => {
    it("returns spot = 1 for ADA currency without calling API", async () => {
      const result = await VesprApiRepository.getAdaSpotPrice(CryptoCurrency.ADA);

      expect(result).toEqual({
        currency: CryptoCurrency.ADA,
        spot: "1",
        spot1hAgo: null,
        spot24hAgo: null,
      });

      // Should not call the API for ADA
      expect(getAdaSpotPriceSpy).not.toHaveBeenCalled();
    });

    it("fetches spot price for fiat currency from API", async () => {
      const mockSpotPrice: AdaSpotPriceResponse = {
        currency: FiatCurrency.EUR,
        spot: "0.32",
        spot1hAgo: "0.31",
        spot24hAgo: "0.30",
      };

      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = await VesprApiRepository.getAdaSpotPrice(FiatCurrency.EUR);
      expect(result).toEqual(mockSpotPrice);
      expect(getAdaSpotPriceSpy).toHaveBeenCalledWith(FiatCurrency.EUR);
    });
  });

  describe("getDetailedWallet", () => {
    it("fetches wallet details from API", async () => {
      const mockWallet: WalletDetailedResponse = {
        lovelace: "1000000000",
        rewards_lovelace: "50000000",
        handles: ["$test"],
        tokens: [],
      };

      fetchWalletDetailedSpy.mockResolvedValue(mockWallet);

      const result = await VesprApiRepository.getDetailedWallet("addr1test...");
      expect(result).toEqual(mockWallet);
      expect(fetchWalletDetailedSpy).toHaveBeenCalledWith("addr1test...");
    });
  });

  describe("getTransactionHistory", () => {
    it("fetches transaction history from API", async () => {
      const mockHistory: TransactionHistoryResponse = {
        sinceBlock: 0,
        toBlock: 1000,
        transactions: [],
      };

      fetchTransactionHistorySpy.mockResolvedValue(mockHistory);

      const result = await VesprApiRepository.getTransactionHistory("addr1test...");
      expect(result).toEqual(mockHistory);
      expect(fetchTransactionHistorySpy).toHaveBeenCalledWith("addr1test...", undefined);
    });

    it("passes toBlock parameter when provided", async () => {
      const mockHistory: TransactionHistoryResponse = {
        sinceBlock: 0,
        toBlock: 500,
        transactions: [],
      };

      fetchTransactionHistorySpy.mockResolvedValue(mockHistory);

      await VesprApiRepository.getTransactionHistory("addr1test...", 500);
      expect(fetchTransactionHistorySpy).toHaveBeenCalledWith("addr1test...", 500);
    });
  });

  describe("getTokenInfo", () => {
    it("fetches token info from API", async () => {
      const mockTokenInfo: TokenInfoResponse = {
        data: {
          subject: "unit123",
          name: "Test Token",
          ticker: "TEST",
          description: "A test token",
          url: "https://test.com",
          decimals: 6,
          price: 0.5,
          circSupply: 1000000,
          fdv: 500000,
          mcap: 250000,
          totalSupply: 1000000,
          riskCategory: "BBB",
          verified: true,
          currency: FiatCurrency.GBP,
        },
      };

      fetchTokenInfoSpy.mockResolvedValue(mockTokenInfo);

      const result = await VesprApiRepository.getTokenInfo("unit123", FiatCurrency.GBP);
      expect(result).toEqual(mockTokenInfo);
      expect(fetchTokenInfoSpy).toHaveBeenCalledWith("unit123", FiatCurrency.GBP);
    });

    it("uses USD as default currency", async () => {
      const mockTokenInfo: TokenInfoResponse = {
        data: {
          subject: "unit456",
          name: "Test Token 2",
          ticker: null,
          description: null,
          url: null,
          decimals: 0,
          price: null,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 1000,
          riskCategory: null,
          verified: false,
          currency: FiatCurrency.USD,
        },
      };

      fetchTokenInfoSpy.mockResolvedValue(mockTokenInfo);

      await VesprApiRepository.getTokenInfo("unit456");
      expect(fetchTokenInfoSpy).toHaveBeenCalledWith("unit456", FiatCurrency.USD);
    });
  });

  describe("getTokenChart", () => {
    it("fetches token chart data from API", async () => {
      const mockChart: TokenChartResponse = {
        data: [{ open: 0.5, high: 0.6, low: 0.4, close: 0.55, timestamp: 1000, volume: 10000 }],
        interval: "1h",
        currency: CryptoCurrency.ADA,
      };

      fetchTokenChartSpy.mockResolvedValue(mockChart);

      const result = await VesprApiRepository.getTokenChart("unit123", "24H", CryptoCurrency.ADA);
      expect(result).toEqual(mockChart);
      expect(fetchTokenChartSpy).toHaveBeenCalledWith("unit123", "24H", CryptoCurrency.ADA);
    });

    it("uses default period and currency", async () => {
      const mockChart: TokenChartResponse = {
        data: [],
        interval: "1h",
        currency: CryptoCurrency.ADA,
      };

      fetchTokenChartSpy.mockResolvedValue(mockChart);

      await VesprApiRepository.getTokenChart("unit123");
      expect(fetchTokenChartSpy).toHaveBeenCalledWith("unit123", "24H", CryptoCurrency.ADA);
    });
  });

  describe("getTrendingTokens", () => {
    it("fetches trending tokens from API", async () => {
      const mockTrending: TrendingTokensResponse = {
        data: [],
      };

      fetchTrendingTokensSpy.mockResolvedValue(mockTrending);

      const result = await VesprApiRepository.getTrendingTokens(FiatCurrency.JPY, "1H");
      expect(result).toEqual(mockTrending);
      expect(fetchTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.JPY, "1H");
    });

    it("uses USD as default currency", async () => {
      const mockTrending: TrendingTokensResponse = { data: [] };
      fetchTrendingTokensSpy.mockResolvedValue(mockTrending);

      await VesprApiRepository.getTrendingTokens();
      expect(fetchTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.USD, undefined);
    });
  });

  describe("getStakingInfo", () => {
    it("fetches staking info from API", async () => {
      const mockStaking: StakingInfoResponse = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1...",
        lovelace: "1000000000",
        response_time_utc: 123456789,
        epoch_start_time_utc: 123400000,
        epoch_end_time_utc: 123500000,
        first_reward_time_utc: 123600000,
        average_apy: 0.05,
        suggested_pool: {
          pool_id: "pool1...",
          meta: null,
          apy: 0.05,
          saturation: 50,
        },
      };

      fetchStakingInfoSpy.mockResolvedValue(mockStaking);

      const result = await VesprApiRepository.getStakingInfo("addr1...");
      expect(result).toEqual(mockStaking);
      expect(fetchStakingInfoSpy).toHaveBeenCalledWith("addr1...");
    });
  });

  describe("resolveAdaHandle", () => {
    it("fetches handle resolution from API", async () => {
      const mockHandle: AdaHandleOwnerResponse = {
        owner: "addr1...",
      };

      resolveAdaHandleSpy.mockResolvedValue(mockHandle);

      const result = await VesprApiRepository.resolveAdaHandle("$newhandle");
      expect(result).toEqual(mockHandle);
      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("$newhandle");
    });

    it("handles handle without $ prefix", async () => {
      const mockHandle: AdaHandleOwnerResponse = { owner: "addr1..." };
      resolveAdaHandleSpy.mockResolvedValue(mockHandle);

      await VesprApiRepository.resolveAdaHandle("anotherhandle");
      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("anotherhandle");
    });
  });

  describe("getAssetMetadata", () => {
    it("fetches asset metadata from API", async () => {
      const mockMetadata: AssetMetadataResponse = {
        name: "Test Asset",
        onchain_metadata: { image: "ipfs://..." },
      };

      fetchAssetMetadataSpy.mockResolvedValue(mockMetadata);

      const result = await VesprApiRepository.getAssetMetadata("newunit123");
      expect(result).toEqual(mockMetadata);
      expect(fetchAssetMetadataSpy).toHaveBeenCalledWith("newunit123");
    });
  });

  describe("getAssetSummary", () => {
    it("fetches asset summary from API", async () => {
      const mockSummary: AssetSummaryResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };

      fetchAssetSummarySpy.mockResolvedValue(mockSummary);

      const result = await VesprApiRepository.getAssetSummary(["unit1", "unit2"]);
      expect(result).toEqual(mockSummary);
      expect(fetchAssetSummarySpy).toHaveBeenCalledWith(["unit1", "unit2"]);
    });
  });

  describe("getPoolInfo", () => {
    it("fetches pool info from API", async () => {
      const mockPool: PoolInfoResponse = {
        response_time_utc: 123456789,
        pool_id_bech32: "pool1newpool...",
        detail: null,
        active_stake_lovelace: "1000000000",
        live_stake_lovelace: "1000000000",
        saturation: 50,
        state: "registered",
        apy: 0.05,
        pledge: "100000000000",
        dtu: 0.8,
        total_blocks: 1000,
        delegators_count: 100,
        fixed_fee: "340000000",
        variable_fee: 0.02,
        history: [],
      };

      fetchPoolInfoSpy.mockResolvedValue(mockPool);

      const result = await VesprApiRepository.getPoolInfo("pool1newpool...");
      expect(result).toEqual(mockPool);
      expect(fetchPoolInfoSpy).toHaveBeenCalledWith("pool1newpool...");
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { VesprApiClient } from "./VesprApiClient.js";
import { FetchApiClient } from "../utils/api/FetchApiClient.js";
import { FiatCurrency, CryptoCurrency } from "../types/currency.js";

describe("VesprApiClient", () => {
  let client: VesprApiClient;
  let getSpy: jest.SpiedFunction<typeof FetchApiClient.prototype.get>;
  let postSpy: jest.SpiedFunction<typeof FetchApiClient.prototype.post>;

  beforeEach(() => {
    getSpy = jest.spyOn(FetchApiClient.prototype, "get");
    postSpy = jest.spyOn(FetchApiClient.prototype, "post");
    client = new VesprApiClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("fetchWalletDetailed", () => {
    it("calls FetchApiClient.post with correct parameters", async () => {
      const mockResponse = {
        lovelace: "1000000000",
        rewards_lovelace: "0",
        handles: [],
        tokens: [],
      };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchWalletDetailed("addr1qtest123");

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v7/wallet/detailed",
          body: { address: "addr1qtest123" },
          context: expect.stringContaining("wallet"),
        }),
      );
    });
  });

  describe("getAdaSpotPrice", () => {
    it("calls FetchApiClient.get with correct parameters", async () => {
      const mockResponse = {
        currency: FiatCurrency.USD,
        spot: "0.35",
        spot1hAgo: "0.34",
        spot24hAgo: "0.33",
      };
      getSpy.mockResolvedValue(mockResponse);

      const result = await client.getAdaSpotPrice(FiatCurrency.USD);

      expect(result).toEqual(mockResponse);
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v5/ada/spot?currency=USD",
          context: expect.stringContaining("ada-spot"),
        }),
      );
    });

    it("encodes currency parameter correctly", async () => {
      getSpy.mockResolvedValue({
        currency: FiatCurrency.EUR,
        spot: "0.30",
        spot1hAgo: null,
        spot24hAgo: null,
      });

      await client.getAdaSpotPrice(FiatCurrency.EUR);

      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v5/ada/spot?currency=EUR",
        }),
      );
    });
  });

  describe("fetchTransactionHistory", () => {
    it("calls FetchApiClient.post with address", async () => {
      const mockResponse = {
        sinceBlock: 0,
        toBlock: 1000,
        transactions: [],
      };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchTransactionHistory("addr1test");

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/wallet/transactions",
          body: { address: "addr1test", maybe_to_block: undefined },
        }),
      );
    });

    it("includes toBlock when provided", async () => {
      postSpy.mockResolvedValue({
        sinceBlock: 0,
        toBlock: 500,
        transactions: [],
      });

      await client.fetchTransactionHistory("addr1test", 500);

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { address: "addr1test", maybe_to_block: 500 },
        }),
      );
    });
  });

  describe("fetchStakingInfo", () => {
    it("calls FetchApiClient.post with correct parameters", async () => {
      const mockResponse = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1...",
        lovelace: "1000000",
        response_time_utc: 123456,
        epoch_start_time_utc: 123000,
        epoch_end_time_utc: 124000,
        first_reward_time_utc: null,
        average_apy: 0.05,
        suggested_pool: null,
      };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchStakingInfo("addr1test");

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v5/wallet/rewards/staking/info",
          body: { address: "addr1test" },
        }),
      );
    });
  });

  describe("fetchTokenInfo", () => {
    it("calls FetchApiClient.get with unit and default currency", async () => {
      const mockResponse = {
        data: {
          subject: "unit123",
          name: "Test Token",
          ticker: "TEST",
          description: null,
          url: null,
          decimals: 6,
          price: 0.5,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 1000000,
          riskCategory: null,
          verified: false,
          currency: FiatCurrency.USD,
        },
      };
      getSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchTokenInfo("unit123");

      expect(result).toEqual(mockResponse);
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v1/token/unit123/info?currency=USD",
        }),
      );
    });

    it("uses specified currency", async () => {
      getSpy.mockResolvedValue({
        data: {
          subject: "unit123",
          name: "Test",
          ticker: null,
          description: null,
          url: null,
          decimals: 0,
          price: null,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 0,
          riskCategory: null,
          verified: false,
          currency: CryptoCurrency.ADA,
        },
      });

      await client.fetchTokenInfo("unit123", CryptoCurrency.ADA);

      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v1/token/unit123/info?currency=ADA",
        }),
      );
    });
  });

  describe("fetchTokenChart", () => {
    it("calls FetchApiClient.get with default parameters", async () => {
      const mockResponse = {
        data: [],
        interval: "1h",
        currency: CryptoCurrency.ADA,
      };
      getSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchTokenChart("unit123");

      expect(result).toEqual(mockResponse);
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("/v1/token/unit123/chart"),
        }),
      );
    });

    it("uses custom period and currency", async () => {
      getSpy.mockResolvedValue({
        data: [],
        interval: "1d",
        currency: FiatCurrency.EUR,
      });

      await client.fetchTokenChart("unit123", "1W", FiatCurrency.EUR);

      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringMatching(/period=1W.*currency=EUR|currency=EUR.*period=1W/),
        }),
      );
    });
  });

  describe("fetchTrendingTokens", () => {
    it("calls FetchApiClient.get with currency only", async () => {
      const mockResponse = { data: [] };
      getSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchTrendingTokens(FiatCurrency.USD);

      expect(result).toEqual(mockResponse);
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("/v1/tokens/explore/trending"),
        }),
      );
    });

    it("includes period when provided", async () => {
      getSpy.mockResolvedValue({ data: [] });

      await client.fetchTrendingTokens(FiatCurrency.USD, "1H");

      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("period=1H"),
        }),
      );
    });
  });

  describe("resolveAdaHandle", () => {
    it("normalizes handle by removing $ prefix", async () => {
      const mockResponse = { owner: "addr1..." };
      postSpy.mockResolvedValue(mockResponse);

      await client.resolveAdaHandle("$myhandle");

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { handle: "myhandle" },
        }),
      );
    });

    it("handles handle without $ prefix", async () => {
      postSpy.mockResolvedValue({ owner: "addr1..." });

      await client.resolveAdaHandle("myhandle");

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { handle: "myhandle" },
        }),
      );
    });

    it("converts handle to lowercase", async () => {
      postSpy.mockResolvedValue({ owner: "addr1..." });

      await client.resolveAdaHandle("$MyHandle");

      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { handle: "myhandle" },
        }),
      );
    });
  });

  describe("fetchAssetMetadata", () => {
    it("calls FetchApiClient.get with correct path", async () => {
      const mockResponse = {
        name: "Test Asset",
        onchain_metadata: { image: "ipfs://..." },
      };
      getSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchAssetMetadata("unit123");

      expect(result).toEqual(mockResponse);
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/asset/unit123/metadata",
        }),
      );
    });

    it("encodes unit parameter", async () => {
      getSpy.mockResolvedValue({ name: "Test", onchain_metadata: null });

      await client.fetchAssetMetadata("unit/with/special");

      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/asset/unit%2Fwith%2Fspecial/metadata",
        }),
      );
    });
  });

  describe("fetchAssetSummary", () => {
    it("calls FetchApiClient.post with units array", async () => {
      const mockResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchAssetSummary(["unit1", "unit2"]);

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/asset/summary",
          body: { assets_unit: ["unit1", "unit2"] },
        }),
      );
    });
  });

  describe("fetchPoolInfo", () => {
    it("calls FetchApiClient.post with pool ID", async () => {
      const mockResponse = {
        response_time_utc: 123456,
        pool_id_bech32: "pool1test",
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
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchPoolInfo("pool1test");

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/pool/info",
          body: { pool_id_bech_32: "pool1test" },
        }),
      );
    });
  });
});

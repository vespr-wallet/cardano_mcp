import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { VesprApiClient } from "./VesprApiClient.js";
import { FetchApiClient } from "../utils/api/FetchApiClient.js";
import { FiatCurrency, CryptoCurrency } from "../types/currency.js";
import { config } from "../config.js";
import { apiKeyContext } from "../utils/apiKeyContext.js";

describe("VesprApiClient", () => {
  let client: VesprApiClient;
  let getSpy: jest.SpiedFunction<typeof FetchApiClient.prototype.get>;
  let postSpy: jest.SpiedFunction<typeof FetchApiClient.prototype.post>;

  beforeEach(() => {
    config.apiKey = "test-api-key";
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

  describe("fetchWalletUtxos", () => {
    it("calls FetchApiClient.post with correct parameters", async () => {
      const mockResponse = { hex_utxos: ["8282"], collateral_hex_utxos: [] };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchWalletUtxos("addr1qtest123");

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/wallet/cip30/utxos",
          body: { address: "addr1qtest123" },
          context: expect.stringContaining("utxos"),
        }),
      );
    });
  });

  describe("fetchSwapHistory", () => {
    it("calls FetchApiClient.post with the backend body field names", async () => {
      const mockResponse = { data: [], next_page_cursor: null };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchSwapHistory({
        address: "addr1qtest123",
        openOnly: true,
        assetUnit: "416461",
        pageCursor: "2026-10-30T12:00:00.000Z",
      });

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/wallet/swap/history",
          body: {
            address_bech_32: "addr1qtest123",
            open_only: true,
            asset_unit: "416461",
            page_cursor: "2026-10-30T12:00:00.000Z",
          },
        }),
      );
    });
  });

  describe("fetchSwapOrderStatus", () => {
    it("calls FetchApiClient.post with correct parameters", async () => {
      const mockResponse = { data: null };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchSwapOrderStatus("addr1qtest123", "ab".repeat(32));

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/wallet/swap/status",
          body: { address_bech_32: "addr1qtest123", submission_tx_hash: "ab".repeat(32) },
        }),
      );
    });
  });

  describe("fetchSwapEstimate", () => {
    it("asks for an exact-in estimate with the backend body field names", async () => {
      const mockResponse = { runtime_type: "POOL_NOT_FOUND" };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchSwapEstimate({
        tokenInUnit: "416461",
        tokenOutUnit: "unit123",
        amountIn: "100",
        currency: FiatCurrency.USD,
      });

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v4/wallet/swap/estimate",
          body: {
            token_in_unit: "416461",
            token_out_unit: "unit123",
            quantity_decimals_adjusted: "100",
            type: "exact_in",
            currency: FiatCurrency.USD,
          },
        }),
      );
    });
  });

  describe("fetchTxStatus", () => {
    it("calls FetchApiClient.post with correct parameters", async () => {
      const mockResponse = { tip: { slot: 1, height: 1 }, transactions: [] };
      postSpy.mockResolvedValue(mockResponse);

      const result = await client.fetchTxStatus(["ab".repeat(32)]);

      expect(result).toEqual(mockResponse);
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ path: "/v1/wallet/txstatus", body: { tx_hashes: ["ab".repeat(32)] } }),
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

describe("VesprApiClient API key resolution", () => {
  const originalApiKey = config.apiKey;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ currency: "EUR", spot: "0.3", spot1hAgo: null, spot24hAgo: null }), {
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    config.apiKey = originalApiKey;
    jest.restoreAllMocks();
  });

  function sentApiKey(): string | undefined {
    const init = fetchSpy.mock.calls[0]?.[1];
    return new Headers(init?.headers).get("x-api-key") ?? undefined;
  }

  it("throws a helpful error when neither the request nor the environment provides a key", async () => {
    config.apiKey = undefined;

    await expect(new VesprApiClient().getAdaSpotPrice(FiatCurrency.EUR)).rejects.toThrow(
      "VESPR API key is required. Provide it via X-API-Key header (HTTP) or VESPR_API_KEY environment variable (stdio/npx).",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the configured key when no request key is set", async () => {
    config.apiKey = "env-key";

    await new VesprApiClient().getAdaSpotPrice(FiatCurrency.EUR);

    expect(sentApiKey()).toBe("env-key");
  });

  it("prefers the per-request key from the API key context over the configured key", async () => {
    config.apiKey = "env-key";

    await apiKeyContext.run("request-key", () => new VesprApiClient().getAdaSpotPrice(FiatCurrency.EUR));

    expect(sentApiKey()).toBe("request-key");
  });
});

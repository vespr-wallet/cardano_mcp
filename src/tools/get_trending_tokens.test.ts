import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTrendingTokens } from "./get_trending_tokens.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { TrendingTokensResponse, TrendingPeriod } from "../types/api/schemas.js";
import { FiatCurrency, SupportedCurrency } from "../types/currency.js";

describe("get_trending_tokens tool", () => {
  let registeredHandler: (args: { currency?: string; period?: TrendingPeriod; limit?: number }) => Promise<unknown>;
  let getTrendingTokensSpy: jest.SpiedFunction<typeof VesprApiRepository.getTrendingTokens>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (
          _name: string,
          _config: unknown,
          handler: (args: { currency?: string; period?: TrendingPeriod; limit?: number }) => Promise<unknown>,
        ) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetTrendingTokens(mockServer);

    // Spy on the repository method
    getTrendingTokensSpy = jest.spyOn(VesprApiRepository, "getTrendingTokens");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockTrendingToken = (overrides: Partial<TrendingTokensResponse["data"][0]> = {}) => ({
    policy: "abc123policy456",
    hex_asset_name: "54455354",
    name: "Test Token",
    ticker: "TEST",
    verified: true,
    decimals: 6,
    ada_per_adjusted_unit: 0.123456,
    period_ada_price_change_percentage: 5.25,
    period_volume_ada: 100000,
    period_buys_count: 150,
    period_sales_count: 100,
    chart_data: null,
    ...overrides,
  });

  describe("default request", () => {
    it("returns trending tokens with default parameters", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [
          createMockTrendingToken({ name: "Token A", ticker: "TOKA" }),
          createMockTrendingToken({ name: "Token B", ticker: "TOKB" }),
        ],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        structuredContent: {
          currency: string;
          tokens: { name: string; ticker: string | null }[];
        };
      };

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.USD, undefined);

      // Check structured content
      expect(result.structuredContent.currency).toBe("USD");
      expect(result.structuredContent.tokens).toHaveLength(2);
      expect(result.structuredContent.tokens[0].name).toBe("Token A");
      expect(result.structuredContent.tokens[1].name).toBe("Token B");

      // Check text content
      expect(result.content[0].text).toContain("Trending Tokens");
      expect(result.content[0].text).toContain("1. Token A (TOKA)");
      expect(result.content[0].text).toContain("2. Token B (TOKB)");
    });
  });

  describe("period parameter", () => {
    it("passes period parameter to repository", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken()],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ period: "1H" })) as {
        content: { type: string; text: string }[];
        structuredContent: { period: string | null };
      };

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.USD, "1H");
      expect(result.structuredContent.period).toBe("1H");
      expect(result.content[0].text).toContain("(1H)");
    });

    it("handles 1D period", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken()],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      await registeredHandler({ period: "1D" });

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.USD, "1D");
    });

    it("handles 5M period", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken()],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      await registeredHandler({ period: "5M" });

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.USD, "5M");
    });
  });

  describe("limit parameter", () => {
    it("truncates results based on limit", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [
          createMockTrendingToken({ name: "Token 1" }),
          createMockTrendingToken({ name: "Token 2" }),
          createMockTrendingToken({ name: "Token 3" }),
          createMockTrendingToken({ name: "Token 4" }),
          createMockTrendingToken({ name: "Token 5" }),
        ],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ limit: 3 })) as {
        structuredContent: { tokens: { name: string }[] };
      };

      expect(result.structuredContent.tokens).toHaveLength(3);
      expect(result.structuredContent.tokens[0].name).toBe("Token 1");
      expect(result.structuredContent.tokens[2].name).toBe("Token 3");
    });

    it("defaults to 10 items if not specified", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: Array.from({ length: 15 }, (_, i) => createMockTrendingToken({ name: `Token ${i + 1}` })),
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        structuredContent: { tokens: { name: string }[] };
      };

      expect(result.structuredContent.tokens).toHaveLength(10);
    });
  });

  describe("currency parameter", () => {
    it("passes currency parameter to repository", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken()],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ currency: "EUR" })) as {
        content: { type: string; text: string }[];
        structuredContent: { currency: string };
      };

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.EUR, undefined);
      expect(result.structuredContent.currency).toBe("EUR");
      expect(result.content[0].text).toContain("EUR");
    });
  });

  describe("empty results", () => {
    it("handles empty results gracefully", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        structuredContent: { tokens: unknown[] };
      };

      expect(result.structuredContent.tokens).toHaveLength(0);
      expect(result.content[0].text).toContain("No trending tokens found");
    });
  });

  describe("output formatting", () => {
    it("formats verified tokens with indicator", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ verified: true })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).toContain("[Verified]");
    });

    it("does not show verified indicator for unverified tokens", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ verified: false })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).not.toContain("[Verified]");
    });

    it("formats positive price change with plus sign", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ period_ada_price_change_percentage: 10.5 })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).toContain("+10.50%");
    });

    it("formats negative price change correctly", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ period_ada_price_change_percentage: -5.25 })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).toContain("-5.25%");
    });

    it("handles null price change gracefully", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ period_ada_price_change_percentage: null })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).toContain("Change: N/A");
    });

    it("handles token without ticker", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ name: "No Ticker Token", ticker: undefined })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        structuredContent: { tokens: { ticker: string | null }[] };
      };

      expect(result.structuredContent.tokens[0].ticker).toBeNull();
      expect(result.content[0].text).toContain("1. No Ticker Token");
      expect(result.content[0].text).not.toMatch(/1\. No Ticker Token \(/);
    });

    it("formats volume with commas", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ period_volume_ada: 1234567 })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
      };

      expect(result.content[0].text).toContain("Volume: 1,234,567");
    });
  });

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      getTrendingTokensSpy.mockRejectedValue(new VesprApiError("Service unavailable", 503));

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Service unavailable");
    });

    it("handles unexpected errors gracefully", async () => {
      getTrendingTokensSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error objects gracefully", async () => {
      getTrendingTokensSpy.mockRejectedValue("string error");

      const result = (await registeredHandler({})) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });

  describe("combined parameters", () => {
    it("handles all parameters together", async () => {
      const mockResponse: TrendingTokensResponse = {
        data: [createMockTrendingToken({ name: "Top Token" }), createMockTrendingToken({ name: "Second Token" })],
      };

      getTrendingTokensSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({
        currency: "GBP",
        period: "4H",
        limit: 1,
      })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          currency: string;
          period: string | null;
          tokens: { name: string }[];
        };
      };

      expect(getTrendingTokensSpy).toHaveBeenCalledWith(FiatCurrency.GBP, "4H");
      expect(result.structuredContent.currency).toBe("GBP");
      expect(result.structuredContent.period).toBe("4H");
      expect(result.structuredContent.tokens).toHaveLength(1);
      expect(result.structuredContent.tokens[0].name).toBe("Top Token");
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTokenChart } from "./get_token_chart.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { TokenChartResponse, ChartPeriod } from "../types/api/schemas.js";
import { CryptoCurrency, FiatCurrency } from "../types/currency.js";

describe("get_token_chart tool", () => {
  let registeredHandler: (args: { unit: string; period?: string; currency?: string }) => Promise<unknown>;
  let getTokenChartSpy: jest.SpiedFunction<typeof VesprApiRepository.getTokenChart>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (
          _name: string,
          _config: unknown,
          handler: (args: { unit: string; period?: string; currency?: string }) => Promise<unknown>,
        ) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetTokenChart(mockServer);

    // Spy on the repository method
    getTokenChartSpy = jest.spyOn(VesprApiRepository, "getTokenChart");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for empty unit", async () => {
      const result = await registeredHandler({ unit: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Token unit identifier is required." }],
        isError: true,
      });

      // Should not call the API
      expect(getTokenChartSpy).not.toHaveBeenCalled();
    });

    it("returns error for whitespace-only unit", async () => {
      const result = await registeredHandler({ unit: "   " });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Token unit identifier is required." }],
        isError: true,
      });

      expect(getTokenChartSpy).not.toHaveBeenCalled();
    });
  });

  describe("successful responses", () => {
    const validUnit = "abc123def456policyid789012345678901234567890hexassetname";

    it("returns formatted chart data for valid unit", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1h",
        currency: CryptoCurrency.ADA,
        data: [
          { timestamp: 1700000000, open: 0.001, high: 0.0015, low: 0.0009, close: 0.0012, volume: 1000 },
          { timestamp: 1700003600, open: 0.0012, high: 0.0018, low: 0.0011, close: 0.0016, volume: 1500 },
          { timestamp: 1700007200, open: 0.0016, high: 0.002, low: 0.0014, close: 0.0017, volume: 2000 },
        ],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          interval: string;
          currency: string;
          candles: Array<{
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
          }>;
        };
      };

      expect(getTokenChartSpy).toHaveBeenCalledWith(validUnit, "24H", CryptoCurrency.ADA);

      // Check structured content
      expect(result.structuredContent.interval).toBe("1h");
      expect(result.structuredContent.currency).toBe(CryptoCurrency.ADA);
      expect(result.structuredContent.candles).toHaveLength(3);
      expect(result.structuredContent.candles[0].timestamp).toBe(1700000000);
      expect(result.structuredContent.candles[0].open).toBe(0.001);

      // Check text content contains expected summary
      expect(result.content[0].text).toContain("Token Chart (24H) - 3 candles");
      expect(result.content[0].text).toContain("Currency: ADA");
      expect(result.content[0].text).toContain("High:");
      expect(result.content[0].text).toContain("Low:");
      expect(result.content[0].text).toContain("Latest:");
    });

    it("handles empty candle array gracefully", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1h",
        currency: CryptoCurrency.ADA,
        data: [],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          candles: unknown[];
        };
      };

      // Check structured content has empty candles array
      expect(result.structuredContent.candles).toHaveLength(0);

      // Check text shows appropriate message
      expect(result.content[0].text).toContain("Token Chart (24H) - 0 candles");
      expect(result.content[0].text).toContain("No chart data available");
    });

    it("passes period parameter correctly", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1d",
        currency: CryptoCurrency.ADA,
        data: [{ timestamp: 1700000000, open: 0.001, high: 0.002, low: 0.0008, close: 0.0015, volume: 5000 }],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit, period: "1W" })) as {
        content: { type: string; text: string }[];
      };

      expect(getTokenChartSpy).toHaveBeenCalledWith(validUnit, "1W", CryptoCurrency.ADA);
      expect(result.content[0].text).toContain("Token Chart (1W)");
    });

    it("passes currency parameter correctly", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1h",
        currency: FiatCurrency.USD,
        data: [{ timestamp: 1700000000, open: 0.05, high: 0.06, low: 0.04, close: 0.055, volume: 10000 }],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit, currency: "USD" })) as {
        content: { type: string; text: string }[];
      };

      expect(getTokenChartSpy).toHaveBeenCalledWith(validUnit, "24H", FiatCurrency.USD);
      expect(result.content[0].text).toContain("Currency: USD");
    });

    it("accepts all valid period values", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1h",
        currency: CryptoCurrency.ADA,
        data: [{ timestamp: 1700000000, open: 0.001, high: 0.002, low: 0.0008, close: 0.0015, volume: 5000 }],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const validPeriods: ChartPeriod[] = ["1H", "24H", "1W", "1M", "3M", "1Y", "ALL"];

      for (const period of validPeriods) {
        await registeredHandler({ unit: validUnit, period });
        expect(getTokenChartSpy).toHaveBeenLastCalledWith(validUnit, period, CryptoCurrency.ADA);
      }
    });

    it("calculates high/low/latest correctly from candles", async () => {
      const mockResponse: TokenChartResponse = {
        interval: "1h",
        currency: CryptoCurrency.ADA,
        data: [
          { timestamp: 1700000000, open: 0.001, high: 0.005, low: 0.0008, close: 0.003, volume: 1000 },
          { timestamp: 1700003600, open: 0.003, high: 0.01, low: 0.002, close: 0.008, volume: 2000 },
          { timestamp: 1700007200, open: 0.008, high: 0.008, low: 0.001, close: 0.004, volume: 1500 },
        ],
      };

      getTokenChartSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
      };

      // Max high is 0.01 from second candle
      // Min low is 0.0008 from first candle
      // Latest close is 0.004 from third candle
      expect(result.content[0].text).toContain("High: 0.010000");
      expect(result.content[0].text).toContain("Low: 0.000800");
      expect(result.content[0].text).toContain("Latest: 0.004000");
    });
  });

  describe("error handling", () => {
    const validUnit = "abc123def456policyid789012345678901234567890hexassetname";

    it("handles API errors gracefully", async () => {
      getTokenChartSpy.mockRejectedValue(new VesprApiError("Token not found", 404));

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Token not found");
    });

    it("handles unexpected errors gracefully", async () => {
      getTokenChartSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error objects gracefully", async () => {
      getTokenChartSpy.mockRejectedValue("string error");

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTokenInfo } from "./get_token_info.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { TokenInfoResponse } from "../types/api/schemas.js";
import { FiatCurrency } from "../types/currency.js";

describe("get_token_info tool", () => {
  let registeredHandler: (args: { unit: string; currency?: string }) => Promise<unknown>;
  let getTokenInfoSpy: jest.SpiedFunction<typeof VesprApiRepository.getTokenInfo>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { unit: string; currency?: string }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetTokenInfo(mockServer);

    // Spy on the repository method
    getTokenInfoSpy = jest.spyOn(VesprApiRepository, "getTokenInfo");
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
      expect(getTokenInfoSpy).not.toHaveBeenCalled();
    });

    it("returns error for whitespace-only unit", async () => {
      const result = await registeredHandler({ unit: "   " });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Token unit identifier is required." }],
        isError: true,
      });

      expect(getTokenInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe("successful responses", () => {
    const validUnit = "abc123def456policyid789012345678901234567890hexassetname";

    it("returns formatted token info for valid unit", async () => {
      const mockResponse: TokenInfoResponse = {
        data: {
          subject: validUnit,
          name: "Test Token",
          ticker: "TEST",
          description: "A test token for testing",
          url: "https://testtoken.io",
          decimals: 6,
          price: 0.123456,
          circSupply: 1000000000,
          fdv: 1234567890,
          mcap: 123456789,
          totalSupply: 10000000000,
          riskCategory: "BBB",
          verified: true,
          currency: FiatCurrency.USD,
        },
      };

      getTokenInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          subject: string;
          name: string;
          ticker: string | null;
          price: number | null;
          mcap: number | null;
          verified: boolean;
          riskCategory: string | null;
        };
      };

      expect(getTokenInfoSpy).toHaveBeenCalledWith(validUnit, FiatCurrency.USD);

      // Check structured content
      expect(result.structuredContent.subject).toBe(validUnit);
      expect(result.structuredContent.name).toBe("Test Token");
      expect(result.structuredContent.ticker).toBe("TEST");
      expect(result.structuredContent.price).toBe(0.123456);
      expect(result.structuredContent.mcap).toBe(123456789);
      expect(result.structuredContent.verified).toBe(true);
      expect(result.structuredContent.riskCategory).toBe("BBB");

      // Check text content
      expect(result.content[0].text).toContain("Token: Test Token (TEST)");
      expect(result.content[0].text).toContain("Price: 0.12 USD");
      expect(result.content[0].text).toContain("Market Cap:");
      expect(result.content[0].text).toContain("Risk Rating: BBB");
      expect(result.content[0].text).toContain("Verified: Yes");
      expect(result.content[0].text).toContain("Description: A test token for testing");
      expect(result.content[0].text).toContain("URL: https://testtoken.io");
    });

    it("handles null price and market cap gracefully", async () => {
      const mockResponse: TokenInfoResponse = {
        data: {
          subject: validUnit,
          name: "Unknown Token",
          ticker: null,
          description: null,
          url: null,
          decimals: 0,
          price: null,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 1000000,
          riskCategory: "not_available",
          verified: false,
          currency: FiatCurrency.USD,
        },
      };

      getTokenInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          ticker: string | null;
          price: number | null;
          mcap: number | null;
          riskCategory: string | null;
        };
      };

      // Check structured content has nulls
      expect(result.structuredContent.ticker).toBeNull();
      expect(result.structuredContent.price).toBeNull();
      expect(result.structuredContent.mcap).toBeNull();
      expect(result.structuredContent.riskCategory).toBe("not_available");

      // Check text shows N/A for null values and "Not Rated" for not_available
      expect(result.content[0].text).toContain("Token: Unknown Token");
      expect(result.content[0].text).not.toContain("("); // No ticker in parentheses
      expect(result.content[0].text).toContain("Price: N/A");
      expect(result.content[0].text).toContain("Market Cap: N/A");
      expect(result.content[0].text).toContain("Risk Rating: Not Rated");
      expect(result.content[0].text).toContain("Verified: No");
    });

    it("passes currency parameter correctly", async () => {
      const mockResponse: TokenInfoResponse = {
        data: {
          subject: validUnit,
          name: "Test Token",
          ticker: "TEST",
          description: null,
          url: null,
          decimals: 6,
          price: 0.11,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 1000000,
          riskCategory: null,
          verified: false,
          currency: FiatCurrency.EUR,
        },
      };

      getTokenInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit, currency: "EUR" })) as {
        content: { type: string; text: string }[];
      };

      expect(getTokenInfoSpy).toHaveBeenCalledWith(validUnit, FiatCurrency.EUR);
      expect(result.content[0].text).toContain("EUR");
    });

    it("handles token without ticker correctly", async () => {
      const mockResponse: TokenInfoResponse = {
        data: {
          subject: validUnit,
          name: "No Ticker Token",
          ticker: null,
          description: null,
          url: null,
          decimals: 0,
          price: 1.5,
          circSupply: null,
          fdv: null,
          mcap: null,
          totalSupply: 100,
          riskCategory: "A",
          verified: true,
          currency: FiatCurrency.USD,
        },
      };

      getTokenInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
      };

      // Should show name without ticker parentheses
      expect(result.content[0].text).toContain("Token: No Ticker Token");
      expect(result.content[0].text).not.toMatch(/Token: No Ticker Token \(/);
    });

    it("formats large numbers with commas", async () => {
      const mockResponse: TokenInfoResponse = {
        data: {
          subject: validUnit,
          name: "Big Token",
          ticker: "BIG",
          description: null,
          url: null,
          decimals: 6,
          price: 1234567.89,
          circSupply: 1000000000000,
          fdv: 9876543210123,
          mcap: 1234567890123,
          totalSupply: 5000000000000,
          riskCategory: "AAA",
          verified: true,
          currency: FiatCurrency.USD,
        },
      };

      getTokenInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
      };

      // Check that large numbers are formatted with commas
      expect(result.content[0].text).toContain("1,234,567.89");
      expect(result.content[0].text).toContain("1,234,567,890,123");
    });
  });

  describe("error handling", () => {
    const validUnit = "abc123def456policyid789012345678901234567890hexassetname";

    it("handles API errors gracefully", async () => {
      getTokenInfoSpy.mockRejectedValue(new VesprApiError("Token not found", 404));

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Token not found");
    });

    it("handles unexpected errors gracefully", async () => {
      getTokenInfoSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error objects gracefully", async () => {
      getTokenInfoSpy.mockRejectedValue("string error");

      const result = (await registeredHandler({ unit: validUnit })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});

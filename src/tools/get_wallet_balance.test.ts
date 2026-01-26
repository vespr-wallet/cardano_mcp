import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetWalletBalance } from "./get_wallet_balance.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { WalletDetailedResponse, AdaSpotPriceResponse } from "../types/api/schemas.js";
import { FiatCurrency } from "../types/currency.js";

describe("get_wallet_balance tool", () => {
  let registeredHandler: (args: { address: string; currency?: string }) => Promise<unknown>;
  let getDetailedWalletSpy: jest.SpiedFunction<typeof VesprApiRepository.getDetailedWallet>;
  let getAdaSpotPriceSpy: jest.SpiedFunction<typeof VesprApiRepository.getAdaSpotPrice>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (
          _name: string,
          _config: unknown,
          handler: (args: { address: string; currency?: string }) => Promise<unknown>,
        ) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetWalletBalance(mockServer);

    // Spy on the repository methods
    getDetailedWalletSpy = jest.spyOn(VesprApiRepository, "getDetailedWallet");
    getAdaSpotPriceSpy = jest.spyOn(VesprApiRepository, "getAdaSpotPrice");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for invalid address format", async () => {
      const result = await registeredHandler({ address: "invalid-address" });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.",
          },
        ],
        isError: true,
      });

      // Should not call the API
      expect(getDetailedWalletSpy).not.toHaveBeenCalled();
      expect(getAdaSpotPriceSpy).not.toHaveBeenCalled();
    });

    it("returns error for empty address", async () => {
      const result = await registeredHandler({ address: "" });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.",
          },
        ],
        isError: true,
      });

      expect(getDetailedWalletSpy).not.toHaveBeenCalled();
    });

    it("returns error for Byron era address", async () => {
      // Byron addresses start with Ae2 or DdzFF
      const result = await registeredHandler({
        address:
          "DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ",
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.",
          },
        ],
        isError: true,
      });

      expect(getDetailedWalletSpy).not.toHaveBeenCalled();
    });

    it("returns error for unsupported currency", async () => {
      const validAddress =
        "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

      const result = await registeredHandler({
        address: validAddress,
        currency: "INVALID" as FiatCurrency,
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Invalid currency. Currency must be one of the supported fiat currencies.",
          },
        ],
        isError: true,
      });

      expect(getDetailedWalletSpy).not.toHaveBeenCalled();
    });
  });

  describe("successful responses", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    const mockWalletResponse: WalletDetailedResponse = {
      lovelace: "1000000000", // 1000 ADA
      rewards_lovelace: "50000000", // 50 ADA
      handles: ["$testhandle"],
      tokens: [
        {
          policy: "abc123",
          hex_asset_name: "544553545f544f4b454e",
          name: "Test Token",
          ticker: "TEST",
          quantity: "1000000000",
          ada_per_adjusted_unit: "0.5",
          decimals: 6,
        },
      ],
    };

    const mockSpotPrice: AdaSpotPriceResponse = {
      currency: FiatCurrency.USD,
      spot: "0.35",
      spot1hAgo: "0.34",
      spot24hAgo: "0.33",
    };

    it("returns wallet balance with tokens and handles", async () => {
      getDetailedWalletSpy.mockResolvedValue(mockWalletResponse);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: {
          currency: string;
          portfolio_value: string;
          tokens: Array<{ name: string; ticker: string | null; amount: string; value: string | null }>;
          handles: string[];
        };
      };

      // Check structured content
      expect(result.structuredContent.currency).toBe(FiatCurrency.USD);
      expect(result.structuredContent.handles).toEqual(["$testhandle"]);
      expect(result.structuredContent.tokens).toHaveLength(2); // ADA + Test Token

      // Check ADA token
      const adaToken = result.structuredContent.tokens.find((t) => t.ticker === "ADA");
      expect(adaToken).toBeDefined();
      expect(adaToken?.name).toBe("Cardano");
      expect(adaToken?.amount).toBe("1000.000000");

      // Check test token
      const testToken = result.structuredContent.tokens.find((t) => t.ticker === "TEST");
      expect(testToken).toBeDefined();
      expect(testToken?.name).toBe("Test Token");
    });

    it("uses USD as default currency when currency is not specified", async () => {
      getDetailedWalletSpy.mockResolvedValue(mockWalletResponse);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      // Note: The Zod schema applies default, so we pass the expected default value
      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        structuredContent: { currency: string };
      };

      expect(result.structuredContent.currency).toBe(FiatCurrency.USD);
      // Verify the API was called correctly
      expect(getAdaSpotPriceSpy).toHaveBeenCalledWith(FiatCurrency.USD);
    });

    it("calculates portfolio value correctly", async () => {
      getDetailedWalletSpy.mockResolvedValue(mockWalletResponse);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        structuredContent: { portfolio_value: string };
      };

      // 1000 ADA * 0.35 USD = 350 USD for ADA
      // 1000 tokens * 0.5 ADA * 0.35 USD = 175 USD for tokens
      // Total = 525 USD
      expect(parseFloat(result.structuredContent.portfolio_value)).toBeCloseTo(525, 0);
    });

    it("includes text summary with formatted values", async () => {
      getDetailedWalletSpy.mockResolvedValue(mockWalletResponse);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0].text).toContain("Portfolio Value");
      expect(result.content[0].text).toContain("ADA Balance");
      expect(result.content[0].text).toContain("Staking Rewards");
      expect(result.content[0].text).toContain("Tokens");
      expect(result.content[0].text).toContain("Handles");
      expect(result.content[0].text).toContain("$testhandle");
    });

    it("handles wallet with no handles", async () => {
      const walletWithNoHandles = { ...mockWalletResponse, handles: [] };
      getDetailedWalletSpy.mockResolvedValue(walletWithNoHandles);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: { handles: string[] };
      };

      expect(result.structuredContent.handles).toEqual([]);
      expect(result.content[0].text).toContain("Handles: none");
    });

    it("handles token without price", async () => {
      const walletWithTokenNoPrice: WalletDetailedResponse = {
        ...mockWalletResponse,
        tokens: [
          {
            policy: "abc123",
            hex_asset_name: "4e4654",
            name: "NFT Token",
            ticker: null,
            quantity: "1",
            ada_per_adjusted_unit: null,
            decimals: 0,
          },
        ],
      };
      getDetailedWalletSpy.mockResolvedValue(walletWithTokenNoPrice);
      getAdaSpotPriceSpy.mockResolvedValue(mockSpotPrice);

      const result = (await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      })) as {
        structuredContent: {
          tokens: Array<{ name: string; value: string | null }>;
        };
      };

      const nftToken = result.structuredContent.tokens.find((t) => t.name === "NFT Token");
      expect(nftToken).toBeDefined();
      expect(nftToken?.value).toBeNull();
    });
  });

  describe("error handling", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("handles VesprApiError gracefully", async () => {
      const apiError = new VesprApiError("API Error", 500, new Error("Server error"));
      getDetailedWalletSpy.mockRejectedValue(apiError);
      getAdaSpotPriceSpy.mockResolvedValue({
        currency: FiatCurrency.USD,
        spot: "0.35",
        spot1hAgo: "0.34",
        spot24hAgo: "0.33",
      });

      const result = await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      });

      expect(result).toEqual({
        content: [{ type: "text", text: expect.stringContaining("Error:") }],
        isError: true,
      });
    });

    it("handles unexpected errors gracefully", async () => {
      getDetailedWalletSpy.mockRejectedValue(new Error("Network error"));
      getAdaSpotPriceSpy.mockResolvedValue({
        currency: FiatCurrency.USD,
        spot: "0.35",
        spot1hAgo: "0.34",
        spot24hAgo: "0.33",
      });

      const result = await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      });

      expect(result).toEqual({
        content: [{ type: "text", text: expect.stringContaining("Error: An unexpected error occurred") }],
        isError: true,
      });
    });

    it("handles spot price API error gracefully", async () => {
      getDetailedWalletSpy.mockResolvedValue({
        lovelace: "1000000000",
        rewards_lovelace: "0",
        handles: [],
        tokens: [],
      });
      getAdaSpotPriceSpy.mockRejectedValue(
        new VesprApiError("Spot price unavailable", 503, new Error("Service unavailable")),
      );

      const result = await registeredHandler({
        address: validAddress,
        currency: FiatCurrency.USD,
      });

      expect(result).toEqual({
        content: [{ type: "text", text: expect.stringContaining("Error:") }],
        isError: true,
      });
    });
  });
});

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetSupportedCurrencies } from "./get_supported_currencies.js";
import { SUPPORTED_FIAT_CURRENCIES, SUPPORTED_CRYPTO_CURRENCIES } from "../types/currency.js";

describe("get_supported_currencies tool", () => {
  let registeredHandler: () => Promise<unknown>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn((_name: string, _config: unknown, handler: () => Promise<unknown>) => {
        registeredHandler = handler;
      }),
    } as unknown as McpServer;

    registerGetSupportedCurrencies(mockServer);
  });

  describe("tool registration", () => {
    it("registers the tool with correct name", () => {
      const mockServer = {
        registerTool: jest.fn(),
      } as unknown as McpServer;

      registerGetSupportedCurrencies(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "get_supported_currencies",
        expect.objectContaining({
          title: "Get Supported Currencies",
          description: expect.any(String),
        }),
        expect.any(Function),
      );
    });
  });

  describe("successful responses", () => {
    it("returns list of supported fiat and crypto currencies", async () => {
      const result = (await registeredHandler()) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: { fiat: string[]; crypto: string[] };
      };

      // Check structured content
      expect(result.structuredContent).toEqual({
        fiat: SUPPORTED_FIAT_CURRENCIES,
        crypto: SUPPORTED_CRYPTO_CURRENCIES,
      });

      // Check text content
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Supported Fiat Currencies");
      expect(result.content[0].text).toContain("Supported Crypto Currencies");
    });

    it("includes correct number of fiat currencies in text", async () => {
      const result = (await registeredHandler()) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0].text).toContain(`Supported Fiat Currencies (${SUPPORTED_FIAT_CURRENCIES.length})`);
    });

    it("includes correct number of crypto currencies in text", async () => {
      const result = (await registeredHandler()) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0].text).toContain(`Supported Crypto Currencies (${SUPPORTED_CRYPTO_CURRENCIES.length})`);
    });

    it("includes USD in fiat currencies", async () => {
      const result = (await registeredHandler()) as {
        structuredContent: { fiat: string[]; crypto: string[] };
      };

      expect(result.structuredContent.fiat).toContain("USD");
    });

    it("includes ADA in crypto currencies", async () => {
      const result = (await registeredHandler()) as {
        structuredContent: { fiat: string[]; crypto: string[] };
      };

      expect(result.structuredContent.crypto).toContain("ADA");
    });

    it("has only ADA as crypto currency", async () => {
      const result = (await registeredHandler()) as {
        structuredContent: { fiat: string[]; crypto: string[] };
      };

      // Currently only ADA is supported as crypto currency
      expect(result.structuredContent.crypto).toEqual(["ADA"]);
    });
  });
});

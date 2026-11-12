import { jest, describe, it, expect } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetSupportedCurrencies, getSupportedCurrenciesHandler } from "./get_supported_currencies.js";
import { SUPPORTED_FIAT_CURRENCIES, SUPPORTED_CRYPTO_CURRENCIES } from "../types/currency.js";

describe("get_supported_currencies tool", () => {
  const registeredHandler = getSupportedCurrenciesHandler;

  describe("tool registration", () => {
    it("registers the tool with correct name", () => {
      const server = new McpServer({ name: "test", version: "0.0.0" });
      const registerTool = jest.spyOn(server, "registerTool");

      registerGetSupportedCurrencies(server);

      expect(registerTool).toHaveBeenCalledWith(
        "get_supported_currencies",
        expect.objectContaining({
          title: "Get Supported Currencies",
          description: expect.any(String),
        }),
        getSupportedCurrenciesHandler,
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

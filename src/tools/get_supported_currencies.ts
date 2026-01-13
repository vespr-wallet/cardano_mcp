import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SUPPORTED_FIAT_CURRENCIES, SUPPORTED_CRYPTO_CURRENCIES, SUPPORTED_CURRENCIES } from "../types/currency.js";

export function registerGetSupportedCurrencies(server: McpServer): void {
  server.registerTool(
    "get_supported_currencies",
    {
      title: "Get Supported Currencies",
      description: "Get the list of supported fiat and crypto currencies for the available MCP tools",
      inputSchema: {},
      outputSchema: {
        fiat: z.array(z.string()),
        crypto: z.array(z.string()),
      },
    },
    async () => {
      const output = {
        fiat: SUPPORTED_FIAT_CURRENCIES,
        crypto: SUPPORTED_CRYPTO_CURRENCIES,
      };

      const textSummary = [
        `Supported Fiat Currencies (${SUPPORTED_FIAT_CURRENCIES.length}): ${SUPPORTED_FIAT_CURRENCIES.join(", ")}`,
        "",
        `Supported Crypto Currencies (${SUPPORTED_CRYPTO_CURRENCIES.length}): ${SUPPORTED_CRYPTO_CURRENCIES.join(", ")}`,
      ].join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: textSummary,
          },
        ],
        structuredContent: output,
      };
    },
  );
}

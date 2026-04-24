import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { formatWithCommas } from "../utils/formatting.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { FiatCurrency, SupportedCurrency, SUPPORTED_CURRENCIES } from "../types/currency.js";
import { TokenRiskRatingSchema } from "../types/api/schemas.js";

// Output schema matching TokenInfoResponse.data
const tokenInfoOutputSchema = z.object({
  subject: z.string(),
  name: z.string(),
  ticker: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  decimals: z.number(),
  price: z.number().nullable(),
  circSupply: z.number().nullable(),
  fdv: z.number().nullable(),
  mcap: z.number().nullable(),
  totalSupply: z.number(),
  riskCategory: TokenRiskRatingSchema.nullable(),
  verified: z.boolean(),
  currency: z.string(),
});

/**
 * Format a number with commas and optional decimal places
 */
function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) {
    return "N/A";
  }
  const formatted = value.toFixed(decimals);
  return formatWithCommas(formatted);
}

/**
 * Get a human-readable risk category description
 */
function getRiskDescription(category: string | null | undefined): string {
  if (!category || category === "not_available" || category === "unknown") {
    return "Not Rated";
  }
  return category;
}

export function registerGetTokenInfo(server: McpServer): void {
  server.registerTool(
    "get_token_info",
    {
      title: "Get Token Info",
      description:
        "Query detailed information about a Cardano native token including price, market cap, supply, and risk rating.",
      inputSchema: {
        unit: z
          .string()
          .min(1)
          .describe("Token unit identifier (policy ID + hex asset name, e.g., 'policyId.assetName')"),
        currency: z
          .preprocess(
            (val) => (val === null || val === "" ? undefined : val),
            z.enum(SUPPORTED_CURRENCIES).optional().default(FiatCurrency.USD),
          )
          .describe("Currency for price display (default: USD)"),
      },
      outputSchema: tokenInfoOutputSchema,
    },
    async ({ unit, currency }) => {
      // Validate unit is not empty
      if (!unit || unit.trim() === "") {
        return {
          content: [{ type: "text" as const, text: "Error: Token unit identifier is required." }],
          isError: true,
        };
      }

      // Use default currency if not specified
      const effectiveCurrency = (currency as SupportedCurrency) ?? FiatCurrency.USD;

      try {
        const response = await VesprApiRepository.getTokenInfo(unit, effectiveCurrency);
        const data = response.data;

        // Transform response for output (convert undefined to null for schema compliance)
        const output = {
          subject: data.subject,
          name: data.name,
          ticker: data.ticker ?? null,
          description: data.description ?? null,
          url: data.url ?? null,
          decimals: data.decimals,
          price: data.price ?? null,
          circSupply: data.circSupply ?? null,
          fdv: data.fdv ?? null,
          mcap: data.mcap ?? null,
          totalSupply: data.totalSupply,
          riskCategory: data.riskCategory ?? null,
          verified: data.verified,
          currency: data.currency,
        };

        // Format human-readable summary
        const ticker = data.ticker ? ` (${data.ticker})` : "";
        const priceStr = data.price != null ? `${formatNumber(data.price)} ${data.currency}` : "N/A";
        const mcapStr = data.mcap != null ? `${formatNumber(data.mcap, 0)} ${data.currency}` : "N/A";
        const fdvStr = data.fdv != null ? `${formatNumber(data.fdv, 0)} ${data.currency}` : "N/A";
        const circSupplyStr = data.circSupply != null ? formatNumber(data.circSupply, 0) : "N/A";
        const totalSupplyStr = formatNumber(data.totalSupply, 0);
        const riskStr = getRiskDescription(data.riskCategory);

        const summary = [
          `Token: ${data.name}${ticker}`,
          `Price: ${priceStr}`,
          `Market Cap: ${mcapStr}`,
          `FDV: ${fdvStr}`,
          `Circulating Supply: ${circSupplyStr}`,
          `Total Supply: ${totalSupplyStr}`,
          `Risk Rating: ${riskStr}`,
          `Verified: ${data.verified ? "Yes" : "No"}`,
          data.description ? `\nDescription: ${data.description}` : "",
          data.url ? `URL: ${data.url}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof VesprApiError) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` },
          ],
          isError: true,
        };
      }
    },
  );
}

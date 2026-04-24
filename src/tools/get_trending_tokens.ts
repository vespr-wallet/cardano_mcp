import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { formatWithCommas } from "../utils/formatting.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { FiatCurrency, SupportedCurrency, SUPPORTED_CURRENCIES } from "../types/currency.js";
import { TrendingPeriodSchema, TrendingTokenItem } from "../types/api/schemas.js";

// Output schema for trending token item
const trendingTokenOutputSchema = z.object({
  policy: z.string(),
  hexAssetName: z.string(),
  name: z.string(),
  ticker: z.string().nullable(),
  verified: z.boolean(),
  decimals: z.number(),
  price: z.number(),
  changePercent: z.number().nullable(),
  volume: z.number(),
  buys: z.number(),
  sells: z.number(),
});

// Output schema for get_trending_tokens response
const trendingTokensOutputSchema = z.object({
  currency: z.string(),
  period: z.string().nullable(),
  tokens: z.array(trendingTokenOutputSchema),
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
 * Format price with appropriate precision
 */
function formatPrice(value: number, currency: string): string {
  // More decimals for small prices, fewer for larger ones
  const decimals = value < 0.01 ? 6 : value < 1 ? 4 : 2;
  const formatted = value.toFixed(decimals);
  return formatWithCommas(formatted);
}

/**
 * Format percentage change with sign indicator
 */
function formatChange(change: number | null | undefined): string {
  if (change == null) {
    return "N/A";
  }
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Transform API response item to output format
 */
function transformToken(token: TrendingTokenItem): z.infer<typeof trendingTokenOutputSchema> {
  return {
    policy: token.policy,
    hexAssetName: token.hex_asset_name,
    name: token.name,
    ticker: token.ticker ?? null,
    verified: token.verified,
    decimals: token.decimals,
    price: token.ada_per_adjusted_unit,
    changePercent: token.period_ada_price_change_percentage ?? null,
    volume: token.period_volume_ada,
    buys: token.period_buys_count,
    sells: token.period_sales_count,
  };
}

export function registerGetTrendingTokens(server: McpServer): void {
  server.registerTool(
    "get_trending_tokens",
    {
      title: "Get Trending Tokens",
      description:
        "Discover trending Cardano native tokens based on trading activity. Returns tokens ranked by volume for a specified time period.",
      inputSchema: {
        currency: z
          .preprocess(
            (val) => (val === null || val === "" ? undefined : val),
            z.enum(SUPPORTED_CURRENCIES).optional().default(FiatCurrency.USD),
          )
          .describe("Currency for price display (default: USD)"),
        period: z
          .preprocess((val) => (val === null || val === "" ? undefined : val), TrendingPeriodSchema.optional())
          .describe("Time period: 1M (1 min), 5M, 30M, 1H, 4H, 1D (1 day). Default varies by API."),
        limit: z
          .preprocess(
            (val) => (val === null || val === "" ? undefined : val),
            z.number().int().min(1).max(100).optional().default(10),
          )
          .describe("Maximum tokens to return (1-100, default: 10)"),
      },
      outputSchema: trendingTokensOutputSchema,
    },
    async ({ currency, period, limit }) => {
      // Use default values if not specified
      const effectiveCurrency = (currency as SupportedCurrency) ?? FiatCurrency.USD;
      const effectiveLimit = limit ?? 10;

      try {
        const response = await VesprApiRepository.getTrendingTokens(effectiveCurrency, period);

        // Apply limit to results
        const limitedData = response.data.slice(0, effectiveLimit);

        // Transform for output - use the requested currency since API doesn't return it
        const output = {
          currency: effectiveCurrency,
          period: period ?? null,
          tokens: limitedData.map(transformToken),
        };

        // Handle empty results
        if (limitedData.length === 0) {
          const summary = [
            `Trending Tokens${period ? ` (${period})` : ""}`,
            `Currency: ${effectiveCurrency}`,
            ``,
            `No trending tokens found for the specified criteria.`,
          ].join("\n");

          return {
            content: [{ type: "text" as const, text: summary }],
            structuredContent: output,
          };
        }

        // Format human-readable ranked list
        const header = [`Trending Tokens${period ? ` (${period})` : ""}`, `Currency: ${effectiveCurrency}`, ``];

        const tokenLines = limitedData.map((token, index) => {
          const rank = index + 1;
          const ticker = token.ticker ? ` (${token.ticker})` : "";
          const verified = token.verified ? " [Verified]" : "";
          const priceStr = formatPrice(token.ada_per_adjusted_unit, effectiveCurrency);
          const changeStr = formatChange(token.period_ada_price_change_percentage);
          const volumeStr = formatNumber(token.period_volume_ada, 0);

          return [
            `${rank}. ${token.name}${ticker}${verified}`,
            `   Price: ${priceStr} ${effectiveCurrency} | Change: ${changeStr}`,
            `   Volume: ${volumeStr} | Buys: ${token.period_buys_count} | Sells: ${token.period_sales_count}`,
          ].join("\n");
        });

        const summary = [...header, ...tokenLines].join("\n");

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

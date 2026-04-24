import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { formatWithCommas } from "../utils/formatting.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { CryptoCurrency, SupportedCurrency, SUPPORTED_CURRENCIES } from "../types/currency.js";
import { ChartPeriodSchema, TokenChartIntervalSchema } from "../types/api/schemas.js";

// Valid chart periods
const CHART_PERIODS = ["1H", "24H", "1W", "1M", "3M", "1Y", "ALL"] as const;

// Output schema for candle data
const candleOutputSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

// Output schema matching TokenChartResponse structure
const tokenChartOutputSchema = z.object({
  interval: TokenChartIntervalSchema,
  currency: z.string(),
  candles: z.array(candleOutputSchema),
});

/**
 * Format a number with appropriate precision for price display
 */
function formatPrice(value: number, currency: string): string {
  // Use more decimal places for ADA since token prices can be small fractions
  const decimals = currency === CryptoCurrency.ADA ? 6 : 2;
  const formatted = value.toFixed(decimals);
  return formatWithCommas(formatted);
}

/**
 * Format a timestamp as ISO date string
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export function registerGetTokenChart(server: McpServer): void {
  server.registerTool(
    "get_token_chart",
    {
      title: "Get Token Chart",
      description:
        "Query OHLCV (Open, High, Low, Close, Volume) price chart data for a Cardano native token. Returns candlestick data for the specified time period.",
      inputSchema: {
        unit: z
          .string()
          .min(1)
          .describe("Token unit identifier (policy ID + hex asset name, e.g., 'policyId.assetName')"),
        period: z
          .preprocess(
            (val) => (val === null || val === "" ? undefined : val),
            ChartPeriodSchema.optional().default("24H"),
          )
          .describe(
            "Chart period: 1H (1 hour), 24H (24 hours), 1W (1 week), 1M (1 month), 3M (3 months), 1Y (1 year), ALL",
          ),
        currency: z
          .preprocess(
            (val) => (val === null || val === "" ? undefined : val),
            z.enum(SUPPORTED_CURRENCIES).optional().default(CryptoCurrency.ADA),
          )
          .describe("Currency for price display (default: ADA)"),
      },
      outputSchema: tokenChartOutputSchema,
    },
    async ({ unit, period, currency }) => {
      // Validate unit is not empty
      if (!unit || unit.trim() === "") {
        return {
          content: [{ type: "text" as const, text: "Error: Token unit identifier is required." }],
          isError: true,
        };
      }

      // Use default values if not specified
      const effectivePeriod = period ?? "24H";
      const effectiveCurrency = (currency as SupportedCurrency) ?? CryptoCurrency.ADA;

      try {
        const response = await VesprApiRepository.getTokenChart(unit, effectivePeriod, effectiveCurrency);

        // Transform response for output
        const output = {
          interval: response.interval,
          currency: response.currency,
          candles: response.data.map((candle) => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          })),
        };

        // Handle empty candle array
        if (response.data.length === 0) {
          const summary = [
            `Token Chart (${effectivePeriod}) - 0 candles`,
            `Currency: ${response.currency}`,
            `No chart data available for this period.`,
          ].join("\n");

          return {
            content: [{ type: "text" as const, text: summary }],
            structuredContent: output,
          };
        }

        // Calculate summary statistics
        const candles = response.data;
        const maxHigh = Math.max(...candles.map((c) => c.high));
        const minLow = Math.min(...candles.map((c) => c.low));
        const lastClose = candles[candles.length - 1].close;
        const startTime = formatTimestamp(candles[0].timestamp);
        const endTime = formatTimestamp(candles[candles.length - 1].timestamp);

        // Format human-readable summary
        const summary = [
          `Token Chart (${effectivePeriod}) - ${candles.length} candles`,
          `Currency: ${response.currency}`,
          `Period: ${startTime} to ${endTime}`,
          `High: ${formatPrice(maxHigh, response.currency)} | Low: ${formatPrice(minLow, response.currency)}`,
          `Latest: ${formatPrice(lastClose, response.currency)}`,
        ].join("\n");

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

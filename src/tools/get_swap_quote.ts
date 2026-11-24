import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { lovelaceToAda } from "../utils/cardano.js";
import { formatWithCommas, roundAmount } from "../utils/formatting.js";
import { normalizeAssetUnit } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { FiatCurrency, SUPPORTED_CURRENCIES, type SupportedCurrency } from "../types/currency.js";
import type { SwapEstimateSplit } from "../types/api/schemas.js";

/** A positive decimal amount such as "100" or "0.5". */
const AMOUNT_REGEX = /^\d+(\.\d+)?$/;

const quoteTokenSchema = z.object({
  unit: z.string().describe('Token unit (policy ID + hex asset name), "416461" for ADA'),
  name: z.string().describe("Token name"),
  ticker: z.string().nullable().describe("Token ticker, if known"),
  verified: z.boolean().describe("Whether the token is verified"),
  value: z.string().nullable().describe("Value of the amount in the requested currency, if a price is known"),
});

const quoteSplitSchema = z.object({
  dex: z.string().describe("DEX this part of the swap is routed to"),
  share_percent: z.string().describe("Share of the input amount routed to this DEX, in percent"),
  batcher_fee_ada: z.string().describe("Batcher fee for this part, in ADA"),
  deposit_ada: z.string().describe("Deposit for this part, in ADA (returned when the order fills or is cancelled)"),
});

const quoteSchema = z.object({
  token_in: quoteTokenSchema.extend({ amount: z.string().describe("Amount sold, in display units") }),
  token_out: quoteTokenSchema.extend({
    expected_amount: z.string().describe("Expected amount received, in display units"),
    min_amount: z.string().describe("Minimum amount received with 1% slippage, in display units"),
  }),
  price: z.string().describe("Expected token_out received per 1 token_in"),
  inverse_price: z.string().describe("token_in paid per 1 token_out"),
  price_impact_percent: z.string().describe("Average price impact across the route, in percent"),
  batcher_fee_ada: z.string().describe("Total batcher fees, in ADA"),
  deposit_ada: z.string().describe("Total deposits, in ADA (returned when the order fills or is cancelled)"),
  aggregator_fee_ada: z.string().describe("Aggregator fee, in ADA"),
  currency: z.string().describe("Currency of the token values"),
  route: z.array(quoteSplitSchema).describe("How the swap is split across DEXes"),
});

const swapQuoteOutputSchema = z.object({
  route_found: z.boolean().describe("Whether any DEX route exists for this pair and amount"),
  quote: quoteSchema.nullable().describe("The quote, or null when no route was found"),
});

type SwapQuoteOutput = z.infer<typeof swapQuoteOutputSchema>;

/** Lovelace as ADA with trailing zeros dropped, e.g. "5000000" -> "5". */
function toAda(lovelace: string): string {
  return roundAmount(lovelaceToAda(lovelace), 6);
}

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** A 0-1 fraction as a percentage with at most 2 decimals, e.g. "0.6" -> "60". */
function toPercent(fraction: string): string {
  return String(Math.round(Number(fraction) * 10_000) / 100);
}

/** Rounds a decimal string for display, keeping at most `decimals` places. */
function round(value: string, decimals: number): string {
  return String(Number(Number(value).toFixed(decimals)));
}

/**
 * Handler for get_swap_quote tool
 */
export async function getSwapQuoteHandler({
  token_in,
  token_out,
  amount,
  currency = FiatCurrency.USD,
}: {
  token_in: string;
  token_out: string;
  amount: string;
  currency?: SupportedCurrency;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: SwapQuoteOutput;
  isError?: boolean;
}> {
  const tokenInUnit = normalizeAssetUnit(token_in);
  const tokenOutUnit = normalizeAssetUnit(token_out);
  if (tokenInUnit === null || tokenOutUnit === null) {
    return errorResult(
      'Invalid token unit. Use the policy ID followed by the hex asset name, or "ADA" / "lovelace" for ADA.',
    );
  }
  if (tokenInUnit === tokenOutUnit) {
    return errorResult("token_in and token_out must be different tokens.");
  }
  const amountIn = amount.trim();
  if (!AMOUNT_REGEX.test(amountIn) || Number(amountIn) <= 0) {
    return errorResult('Invalid amount. Use a positive number in display units, e.g. "100" or "0.5".');
  }

  try {
    const response = await VesprApiRepository.getSwapEstimate({
      tokenInUnit,
      tokenOutUnit,
      amountIn,
      currency,
    });

    if (response.runtime_type === "POOL_NOT_FOUND") {
      return {
        content: [{ type: "text" as const, text: "No swap route found for this pair and amount." }],
        structuredContent: { route_found: false, quote: null },
      };
    }

    const sumLovelace = (pick: (split: SwapEstimateSplit) => string) =>
      toAda(response.order_splits.reduce((acc, split) => acc + BigInt(pick(split)), 0n).toString());

    const quote = {
      token_in: {
        unit: tokenInUnit,
        name: response.token_in.name,
        ticker: response.token_in.ticker ?? null,
        verified: response.token_in.verified,
        value: response.token_in.value_fiat ?? null,
        amount: response.token_in.quantity,
      },
      token_out: {
        unit: tokenOutUnit,
        name: response.token_out.name,
        ticker: response.token_out.ticker ?? null,
        verified: response.token_out.verified,
        value: response.token_out.value_fiat ?? null,
        expected_amount: response.token_out.quantity,
        min_amount: response.token_out_min_quantity,
      },
      price: response.quote_price_ab,
      inverse_price: response.quote_price_ba,
      price_impact_percent: response.impact,
      batcher_fee_ada: sumLovelace((split) => split.fee_lovelace),
      deposit_ada: sumLovelace((split) => split.deposit_lovelace),
      aggregator_fee_ada: toAda(response.aggregator_fee_lovelace),
      currency: response.currency,
      route: response.order_splits.map((split) => ({
        dex: split.dex_name,
        share_percent: toPercent(split.percentage_share),
        batcher_fee_ada: toAda(split.fee_lovelace),
        deposit_ada: toAda(split.deposit_lovelace),
      })),
    };

    const symbolIn = quote.token_in.ticker ?? quote.token_in.name;
    const symbolOut = quote.token_out.ticker ?? quote.token_out.name;
    const text = [
      `Quote: ${formatWithCommas(quote.token_in.amount)} ${symbolIn} → ${formatWithCommas(quote.token_out.expected_amount)} ${symbolOut} expected (min ${formatWithCommas(quote.token_out.min_amount)} with 1% slippage)`,
      `Price: 1 ${symbolIn} = ${round(quote.price, 6)} ${symbolOut}`,
      `Price impact: ${round(quote.price_impact_percent, 2)}%`,
      `Fees: ${quote.batcher_fee_ada} ADA batcher, ${quote.aggregator_fee_ada} ADA aggregator; ${quote.deposit_ada} ADA deposit (returned)`,
      `Route: ${quote.route.map((split) => `${split.dex} ${split.share_percent}%`).join(", ")}`,
      "Quote only: nothing was built or submitted.",
    ].join("\n");

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { route_found: true, quote },
    };
  } catch (error) {
    if (error instanceof VesprApiError) {
      return errorResult(error.message);
    }
    return errorResult(`An unexpected error occurred. ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export const GET_SWAP_QUOTE_DESCRIPTION =
  "Get a swap quote on Cardano DEXes through DexHunter, the aggregator VESPR swaps through: the expected and minimum amount out, price, price impact, fees, and how the swap would be split across DEXes. Quote only: it never builds, signs or submits a transaction, and needs no wallet.";

const emptyToUndefined = (val: unknown) => (val === null || val === "" ? undefined : val);

export const getSwapQuoteInputSchema = {
  token_in: z.string().min(1).describe('Token to sell: policy ID + hex asset name, or "ADA"'),
  token_out: z.string().min(1).describe('Token to buy: policy ID + hex asset name, or "ADA"'),
  amount: z
    .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1))
    .describe('Amount of token_in to sell, in display units (e.g. "100" for 100 ADA)'),
  currency: z
    .preprocess(emptyToUndefined, z.enum(SUPPORTED_CURRENCIES).default(FiatCurrency.USD))
    .describe("Currency for the token values (default: USD)"),
};

export function registerGetSwapQuote(server: McpServer): void {
  server.registerTool(
    "get_swap_quote",
    {
      title: "Get Swap Quote",
      description: GET_SWAP_QUOTE_DESCRIPTION,
      inputSchema: getSwapQuoteInputSchema,
      outputSchema: swapQuoteOutputSchema,
    },
    getSwapQuoteHandler,
  );
}

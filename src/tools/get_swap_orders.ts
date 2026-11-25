import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError, invalidInputResult } from "../types/errors.js";
import { formatWithCommas } from "../utils/formatting.js";
import { roundAmount } from "../utils/formatting.js";
import { ADA_UNIT, isValidCardanoAddress, normalizeAssetUnit, normalizeTxHash } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import type { SwapOrder } from "../types/api/schemas.js";

/** Order statuses that mean the order can still fill or is being cancelled. */
export const OPEN_ORDER_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "PENDING_PARTIAL_FILL",
  "TRYING_TO_CANCEL",
  "TRYING_TO_CANCEL_PARTIAL_FILL",
  "STOP_LOSS",
]);

/** Most units one asset summary call resolves. */
const MAX_NAME_LOOKUP_UNITS = 100;

const swapTokenSchema = z.object({
  unit: z.string().describe('Token unit (policy ID + hex asset name), "416461" for ADA'),
  name: z.string().describe("Token name (the unit when unknown)"),
  ticker: z.string().nullable().describe("Token ticker, if known"),
});

const swapSplitSchema = z.object({
  dex: z.string().describe("DEX the split was routed to"),
  status: z.string().describe("Split status: PENDING, COMPLETED, CANCELLED, TRYING_TO_CANCEL, STOP_LOSS or UNKNOWN"),
  share_percent: z.string().describe("Share of the order's input amount sent through this split, in percent"),
  amount_in: z.string().describe("Input amount of the split, in display units of token_in"),
  expected_amount_out: z.string().describe("Expected output of the split, in display units of token_out"),
  actual_amount_out: z.string().nullable().describe("Output received by the split, once it has been filled"),
  output_index: z.number().int().describe("Output index of the split's order in the submission transaction"),
});

const swapOrderSchema = z.object({
  submission_tx_hash: z.string().describe("Hash of the transaction that placed the order"),
  submission_time: z.string().describe("When the order was placed (ISO date-time)"),
  status: z
    .string()
    .describe(
      "Order status across splits: PENDING, PENDING_PARTIAL_FILL, TRYING_TO_CANCEL, TRYING_TO_CANCEL_PARTIAL_FILL, STOP_LOSS, COMPLETED, COMPLETED_PARTIAL_FILL, CANCELLED or UNKNOWN",
    ),
  is_open: z.boolean().describe("Whether the order is still open (pending, partially filled, or being cancelled)"),
  token_in: swapTokenSchema.describe("Token sold"),
  token_out: swapTokenSchema.describe("Token bought"),
  amount_in: z.string().describe("Input amount, in display units of token_in"),
  spent_amount_in: z.string().describe("Part of the input amount already swapped"),
  expected_amount_out: z.string().describe("Expected output, in display units of token_out"),
  actual_amount_out: z.string().describe("Output received so far"),
  aggregator_fee_ada: z.string().describe("Aggregator fee, in ADA"),
  batcher_fee_ada: z.string().describe("Batcher fees paid, in ADA (refunded for cancelled splits)"),
  held_deposit_ada: z.string().describe("Deposit held by open splits, in ADA (returned on fill or cancel)"),
  dexes: z.array(z.string()).describe("DEXes the order was routed to"),
  splits: z.array(swapSplitSchema).describe("Per-DEX parts of the order (a single-DEX order has one)"),
});

const swapOrdersOutputSchema = z.object({
  orders: z.array(swapOrderSchema).describe("Swap orders, newest first"),
  next_cursor: z.string().nullable().describe("Pass as `cursor` to get the next page; null on the last page"),
});

type SwapToken = z.infer<typeof swapTokenSchema>;
type SwapSplit = z.infer<typeof swapSplitSchema>;
type SwapOrderOutput = z.infer<typeof swapOrderSchema>;
type SwapOrdersOutput = z.infer<typeof swapOrdersOutputSchema>;

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** A 0-1 fraction as a percentage with at most 2 decimals, e.g. "0.6" -> "60". */
function toPercent(fraction: string): string {
  return String(Math.round(Number(fraction) * 10_000) / 100);
}

/** What a token lookup knows about a unit. `decimals` is null when unknown. */
interface TokenMeta {
  name: string;
  ticker: string | null;
  decimals: number | null;
}

const ADA_DECIMALS = 6;

/**
 * Looks up token names and decimals for the given units. They are a nice-to-have: when the lookup fails, units are
 * shown as names and amounts as the backend sent them.
 */
async function lookupTokens(units: string[]): Promise<Map<string, TokenMeta>> {
  const tokens = new Map<string, TokenMeta>([[ADA_UNIT, { name: "ADA", ticker: "ADA", decimals: ADA_DECIMALS }]]);
  const toLookup = [...new Set(units)].filter((unit) => unit !== ADA_UNIT).slice(0, MAX_NAME_LOOKUP_UNITS);
  if (toLookup.length === 0) {
    return tokens;
  }
  const summary = await VesprApiRepository.getAssetSummary(toLookup).catch(() => null);
  for (const token of summary?.tokens ?? []) {
    tokens.set(`${token.policy}${token.hex_asset_name}`, {
      name: token.name,
      ticker: token.ticker ?? null,
      decimals: token.decimals,
    });
  }
  for (const nft of [...(summary?.nfts ?? []), ...(summary?.other_nfts ?? [])]) {
    tokens.set(`${nft.policy}${nft.hex_asset_name}`, { name: nft.name, ticker: null, decimals: 0 });
  }
  return tokens;
}

function toOrderOutput(order: SwapOrder, tokens: Map<string, TokenMeta>): SwapOrderOutput {
  const tokenOf = (unit: string): SwapToken => ({
    unit,
    name: tokens.get(unit)?.name ?? unit,
    ticker: tokens.get(unit)?.ticker ?? null,
  });
  const decimalsIn = tokens.get(order.token_in)?.decimals ?? null;
  const decimalsOut = tokens.get(order.token_out)?.decimals ?? null;
  const amountIn = (value: string) => roundAmount(value, decimalsIn);
  const amountOut = (value: string) => roundAmount(value, decimalsOut);
  const ada = (value: string) => roundAmount(value, ADA_DECIMALS);
  const actualOut = (updateInfo: { actual_out_amount: string } | null | undefined) =>
    updateInfo ? amountOut(updateInfo.actual_out_amount) : null;

  const splits: SwapSplit[] =
    order.runtime_type === "split"
      ? order.splits.map((split) => ({
          dex: split.dex,
          status: split.status,
          share_percent: toPercent(split.percentage_of_total_order),
          amount_in: amountIn(split.amount_in),
          expected_amount_out: amountOut(split.expected_out_amount),
          actual_amount_out: actualOut(split.update_info),
          output_index: split.submission_tx_output_index,
        }))
      : [
          {
            dex: order.dex,
            status: order.status,
            share_percent: "100",
            amount_in: amountIn(order.amount_in),
            expected_amount_out: amountOut(order.expected_out_amount),
            actual_amount_out: actualOut(order.update_info),
            output_index: order.submission_tx_output_index,
          },
        ];

  return {
    submission_tx_hash: order.submission_tx_hash,
    submission_time: order.submission_time,
    status: order.status,
    is_open: OPEN_ORDER_STATUSES.has(order.status),
    token_in: tokenOf(order.token_in),
    token_out: tokenOf(order.token_out),
    amount_in: amountIn(order.amount_in),
    spent_amount_in: amountIn(order.spent_amount_in),
    expected_amount_out: amountOut(order.expected_out_amount),
    actual_amount_out: amountOut(order.actual_out_amount),
    aggregator_fee_ada: ada(order.aggregator_fee),
    batcher_fee_ada: ada(order.paid_batcher_fee),
    held_deposit_ada: ada(order.held_deposit),
    dexes: [...new Set(splits.map((split) => split.dex))],
    splits,
  };
}

function describeOrder(order: SwapOrderOutput): string {
  const symbol = (token: SwapToken) => token.ticker ?? token.name;
  const splits =
    order.splits.length === 1
      ? order.dexes.join(", ")
      : order.splits.map((split) => `${split.dex} ${split.share_percent}% ${split.status}`).join(", ");
  return [
    `- ${order.submission_time} · ${order.status}${order.is_open ? " (open)" : ""}`,
    `${formatWithCommas(order.amount_in)} ${symbol(order.token_in)} → ${formatWithCommas(order.expected_amount_out)} ${symbol(order.token_out)} expected`,
    `${formatWithCommas(order.actual_amount_out)} received`,
    splits,
    `tx ${order.submission_tx_hash}`,
  ].join(" · ");
}

/**
 * Handler for get_swap_orders tool
 */
export async function getSwapOrdersHandler({
  address,
  open_only,
  token_unit,
  cursor,
  submission_tx_hash,
}: {
  address: string;
  open_only: boolean;
  token_unit?: string;
  cursor?: string;
  submission_tx_hash?: string;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: SwapOrdersOutput;
  isError?: boolean;
}> {
  if (!isValidCardanoAddress(address)) {
    return invalidInputResult("Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.");
  }

  let assetUnit: string | undefined;
  if (token_unit !== undefined) {
    const normalized = normalizeAssetUnit(token_unit);
    if (normalized === null) {
      return invalidInputResult(
        'Invalid token unit. Use the policy ID followed by the hex asset name, or "ADA" / "lovelace" for ADA.',
      );
    }
    assetUnit = normalized;
  }

  let txHash: string | undefined;
  if (submission_tx_hash !== undefined) {
    const normalized = normalizeTxHash(submission_tx_hash);
    if (normalized === null) {
      return invalidInputResult("Invalid submission transaction hash. It should be 64 hex characters.");
    }
    txHash = normalized;
  }

  try {
    let orders: SwapOrder[];
    let nextCursor: string | null;
    if (txHash !== undefined) {
      const response = await VesprApiRepository.getSwapOrderStatus(address.trim(), txHash);
      orders = response.data ? [response.data] : [];
      nextCursor = null;
    } else {
      const response = await VesprApiRepository.getSwapHistory({
        address: address.trim(),
        openOnly: open_only,
        assetUnit,
        pageCursor: cursor,
      });
      orders = response.data;
      nextCursor = response.next_page_cursor ?? null;
    }

    const tokens = await lookupTokens(orders.flatMap((order) => [order.token_in, order.token_out]));
    let output = orders.map((order) => toOrderOutput(order, tokens));
    // The backend ignores open_only when filtering by token, so apply it here
    if (open_only && txHash === undefined && assetUnit !== undefined) {
      output = output.filter((order) => order.is_open);
    }

    const structuredContent: SwapOrdersOutput = { orders: output, next_cursor: nextCursor };

    const heading =
      txHash !== undefined
        ? output.length === 0
          ? `No swap order found for transaction ${txHash}.`
          : "Swap order:"
        : output.length === 0
          ? `No ${open_only ? "open " : ""}swap orders found.`
          : `${output.length} ${open_only ? "open " : ""}swap order${output.length !== 1 ? "s" : ""}:`;
    const text = [
      heading,
      ...output.map(describeOrder),
      ...(nextCursor !== null ? [`More orders available: pass cursor "${nextCursor}".`] : []),
    ].join("\n");

    return { content: [{ type: "text" as const, text }], structuredContent };
  } catch (error) {
    if (error instanceof VesprApiError) {
      return errorResult(error.message);
    }
    return errorResult(`An unexpected error occurred. ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export const GET_SWAP_ORDERS_DESCRIPTION =
  "List a Cardano wallet's DEX swap orders as tracked by DexHunter (the aggregator VESPR swaps through), newest first: tokens in and out, amounts, status, and the DEX of each split. Set open_only to see only orders that haven't filled or been cancelled yet, token_unit to see orders involving one token, or submission_tx_hash to look up a single order. Read-only.";

const emptyToUndefined = (val: unknown) => (val === null || val === "" ? undefined : val);

export const getSwapOrdersInputSchema = {
  address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
  open_only: z
    .preprocess(emptyToUndefined, z.boolean().default(false))
    .describe("Only list open orders: pending, partially filled, or being cancelled (default false)"),
  token_unit: z
    .preprocess(emptyToUndefined, z.string().optional())
    .describe('Optional: only list orders that buy or sell this token (policy ID + hex asset name, or "ADA")'),
  cursor: z
    .preprocess(emptyToUndefined, z.iso.datetime({ offset: true }).optional())
    .describe("Optional: `next_cursor` from a previous call, to get the next page"),
  submission_tx_hash: z
    .preprocess(emptyToUndefined, z.string().optional())
    .describe("Optional: hash of the transaction that placed an order, to look up just that order"),
};

export function registerGetSwapOrders(server: McpServer): void {
  server.registerTool(
    "get_swap_orders",
    {
      title: "Get Swap Orders",
      description: GET_SWAP_ORDERS_DESCRIPTION,
      inputSchema: getSwapOrdersInputSchema,
      outputSchema: swapOrdersOutputSchema,
    },
    getSwapOrdersHandler,
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { httpToolRegistry, HttpToolResult } from "../transports/http.js";
import { registerGetAssetMetadata, getAssetMetadataHandler } from "./get_asset_metadata.js";
import { registerGetAssetSummary, getAssetSummaryHandler } from "./get_asset_summary.js";
import { registerGetPoolInfo, getPoolInfoHandler } from "./get_pool_info.js";
import { registerGetSupportedCurrencies, getSupportedCurrenciesHandler } from "./get_supported_currencies.js";
import { registerGetStakingInfo, getStakingInfoHandler } from "./get_staking_info.js";
import { registerGetTokenChart, getTokenChartHandler } from "./get_token_chart.js";
import { registerGetTokenInfo, getTokenInfoHandler } from "./get_token_info.js";
import { registerGetTransactionHistory, getTransactionHistoryHandler } from "./get_transaction_history.js";
import { registerGetTrendingTokens, getTrendingTokensHandler } from "./get_trending_tokens.js";
import { registerGetWalletBalance, getWalletBalanceHandler } from "./get_wallet_balance.js";
import { registerResolveAdaHandle, resolveAdaHandleHandler } from "./resolve_ada_handle.js";
import { SUPPORTED_CURRENCIES, FiatCurrency, CryptoCurrency } from "../types/currency.js";
import { ChartPeriodSchema, TrendingPeriodSchema } from "../types/api/schemas.js";

/**
 * Register tools with MCP server (for STDIO transport)
 */
export function registerTools(server: McpServer): void {
  registerGetSupportedCurrencies(server);
  registerGetWalletBalance(server);
  registerGetTransactionHistory(server);
  registerGetStakingInfo(server);
  registerGetTokenInfo(server);
  registerGetTokenChart(server);
  registerGetTrendingTokens(server);
  registerResolveAdaHandle(server);
  registerGetAssetMetadata(server);
  registerGetAssetSummary(server);
  registerGetPoolInfo(server);
}

/**
 * Register tools with HTTP registry (for HTTP transport)
 */
export function registerHttpTools(): void {
  // get_supported_currencies
  httpToolRegistry.registerTool({
    name: "get_supported_currencies",
    title: "Get Supported Currencies",
    description: "Get the list of supported fiat and crypto currencies for the available MCP tools",
    inputSchema: {},
    handler: getSupportedCurrenciesHandler as () => Promise<HttpToolResult>,
  });

  // get_wallet_balance
  httpToolRegistry.registerTool({
    name: "get_wallet_balance",
    title: "Get Wallet Balance",
    description:
      "Query Cardano wallet balance including ADA and native tokens. This will include the balance from all addresses associated with this wallet, not just the address provided.",
    inputSchema: z.object({
      address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
      currency: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.enum(SUPPORTED_CURRENCIES).default(FiatCurrency.USD),
        )
        .describe("The currency to use for the displayed data"),
    }),
    handler: getWalletBalanceHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_transaction_history
  httpToolRegistry.registerTool({
    name: "get_transaction_history",
    title: "Get Transaction History",
    description: "Query Cardano wallet transaction history",
    inputSchema: z.object({
      address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
      to_block: z
        .preprocess((val) => (val === null || val === "" ? undefined : val), z.number().int().positive().optional())
        .describe("Optional: filter transactions up to this block height"),
    }),
    handler: getTransactionHistoryHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_staking_info
  httpToolRegistry.registerTool({
    name: "get_staking_info",
    title: "Get Staking Info",
    description: "Query Cardano wallet staking information including rewards, pool delegation, and staking status",
    inputSchema: z.object({
      address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
      currency: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.enum(SUPPORTED_CURRENCIES).default(FiatCurrency.USD),
        )
        .describe("The currency to use for the displayed data"),
    }),
    handler: getStakingInfoHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_token_info
  httpToolRegistry.registerTool({
    name: "get_token_info",
    title: "Get Token Info",
    description: "Query detailed information about a Cardano native token including price, market cap, and metadata",
    inputSchema: z.object({
      unit: z.string().describe("Token unit (policy ID + asset name hex, e.g., '8f...abc')"),
      currency: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.enum(SUPPORTED_CURRENCIES).default(FiatCurrency.USD),
        )
        .describe("The currency to use for the displayed data"),
    }),
    handler: getTokenInfoHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_token_chart
  httpToolRegistry.registerTool({
    name: "get_token_chart",
    title: "Get Token Chart",
    description: "Query price chart data for a Cardano native token over a specified time range",
    inputSchema: z.object({
      unit: z.string().describe("Token unit (policy ID + asset name hex)"),
      period: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          ChartPeriodSchema.optional().default("24H"),
        )
        .describe("Chart period: 1H, 24H, 1W, 1M, 3M, 1Y, ALL (default: 24H)"),
      currency: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.enum(SUPPORTED_CURRENCIES).optional().default(CryptoCurrency.ADA),
        )
        .describe("Currency for price display (default: ADA)"),
    }),
    handler: getTokenChartHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_trending_tokens
  httpToolRegistry.registerTool({
    name: "get_trending_tokens",
    title: "Get Trending Tokens",
    description: "Query trending Cardano native tokens based on trading activity",
    inputSchema: z.object({
      limit: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.number().int().min(1).max(100).default(10),
        )
        .describe("Number of tokens to return (1-100)"),
      currency: z
        .preprocess(
          (val) => (val === null || val === "" ? undefined : val),
          z.enum(SUPPORTED_CURRENCIES).default(FiatCurrency.USD),
        )
        .describe("The currency to use for the displayed data"),
      period: z
        .preprocess((val) => (val === null || val === "" ? undefined : val), TrendingPeriodSchema.optional())
        .describe("Time period: 1M (1 min), 5M, 30M, 1H, 4H, 1D. Default varies by API."),
    }),
    handler: getTrendingTokensHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // resolve_ada_handle
  httpToolRegistry.registerTool({
    name: "resolve_ada_handle",
    title: "Resolve ADA Handle",
    description: "Resolve an ADA handle (e.g., $handle) to its associated Cardano wallet address",
    inputSchema: z.object({
      handle: z.string().describe("ADA handle to resolve (with or without $ prefix)"),
    }),
    handler: resolveAdaHandleHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_asset_metadata
  httpToolRegistry.registerTool({
    name: "get_asset_metadata",
    title: "Get Asset Metadata",
    description: "Query on-chain and off-chain metadata for a Cardano native asset",
    inputSchema: z.object({
      unit: z.string().describe("Asset unit (policy ID + asset name hex)"),
    }),
    handler: getAssetMetadataHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_asset_summary
  httpToolRegistry.registerTool({
    name: "get_asset_summary",
    title: "Get Asset Summary",
    description: "Query summary information for a Cardano native asset including supply, holders, and transactions",
    inputSchema: z.object({
      unit: z.string().describe("Asset unit (policy ID + asset name hex)"),
    }),
    handler: getAssetSummaryHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });

  // get_pool_info
  httpToolRegistry.registerTool({
    name: "get_pool_info",
    title: "Get Pool Info",
    description: "Query detailed information about a Cardano stake pool",
    inputSchema: z.object({
      poolId: z.string().describe("Stake pool ID (bech32 format, pool1...)"),
    }),
    handler: getPoolInfoHandler as (args: Record<string, unknown>) => Promise<HttpToolResult>,
  });
}

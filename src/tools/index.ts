import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetAssetMetadata } from "./get_asset_metadata.js";
import { registerGetAssetSummary } from "./get_asset_summary.js";
import { registerGetPoolInfo } from "./get_pool_info.js";
import { registerGetSupportedCurrencies } from "./get_supported_currencies.js";
import { registerGetStakingInfo } from "./get_staking_info.js";
import { registerGetTokenChart } from "./get_token_chart.js";
import { registerGetTokenInfo } from "./get_token_info.js";
import { registerGetTransactionHistory } from "./get_transaction_history.js";
import { registerGetTrendingTokens } from "./get_trending_tokens.js";
import { registerGetWalletBalance } from "./get_wallet_balance.js";
import { registerResolveAdaHandle } from "./resolve_ada_handle.js";

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

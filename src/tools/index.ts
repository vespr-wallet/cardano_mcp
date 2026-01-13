import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetSupportedCurrencies } from "./get_supported_currencies.js";
import { registerGetWalletBalance } from "./get_wallet_balance.js";

export function registerTools(server: McpServer): void {
  registerGetSupportedCurrencies(server);
  registerGetWalletBalance(server);
}

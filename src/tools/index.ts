import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetWalletBalance } from "./get_wallet_balance.js";

export function registerTools(server: McpServer): void {
  registerGetWalletBalance(server);
}

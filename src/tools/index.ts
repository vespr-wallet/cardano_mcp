import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetWalletBalance } from "./getWalletBalance.js";

export function registerTools(server: McpServer): void {
  registerGetWalletBalance(server);
}

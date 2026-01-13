import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import VesprApiClient from "../api/VesprApiClient.js";
import { lovelaceToAda, formatTokenAmount } from "../utils/cardano.js";
import { formatWithCommas } from "../utils/formatting.js";
import { isValidCardanoAddress } from "../utils/validation.js";

export function registerGetWalletBalance(server: McpServer): void {
  server.registerTool(
    "get_wallet_balance",
    {
      title: "Get Wallet Balance",
      description:
        "Query Cardano wallet balance including ADA and native tokens. This will include the balance from all addresses associated with this wallet, not just the address provided.",
      inputSchema: {
        address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
      },
      outputSchema: {
        ada_balance: z.string(),
        staking_rewards: z.string(),
        tokens: z.array(
          z.object({
            name: z.string(),
            ticker: z.string().nullable(),
            amount: z.string(),
          }),
        ),
        handles: z.array(z.string()),
      },
    },
    async ({ address }) => {
      // Validate address format before making API call
      if (!isValidCardanoAddress(address)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.",
            },
          ],
          isError: true,
        };
      }

      try {
        const walletData = await VesprApiClient.fetchWalletDetailed(address);

        // Transform response to match our output schema
        const adaBalance = lovelaceToAda(walletData.lovelace);
        const stakingRewards = lovelaceToAda(walletData.rewards_lovelace);

        const tokens = walletData.tokens.map((token) => ({
          name: token.name || token.hex_asset_name,
          ticker: token.ticker,
          amount: formatTokenAmount(token.quantity, token.decimals),
        }));

        const output = {
          ada_balance: adaBalance,
          staking_rewards: stakingRewards,
          tokens,
          handles: walletData.handles,
        };

        // Format human-readable text with commas
        const formattedAda = formatWithCommas(adaBalance);
        const formattedRewards = formatWithCommas(stakingRewards);
        const tokenCount = tokens.length;
        const handleCount = walletData.handles.length;

        const textSummary = [
          `ADA Balance: ${formattedAda} ADA`,
          `Staking Rewards: ${formattedRewards} ADA`,
          `Tokens: ${tokenCount} token${tokenCount !== 1 ? "s" : ""}`,
          `Handles: ${handleCount > 0 ? walletData.handles.join(", ") : "none"}`,
        ].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: textSummary + "\n\n" + JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        // Handle VesprApiError with user-friendly message
        if (error instanceof VesprApiError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        // Handle unexpected errors
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: An unexpected error occurred. ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

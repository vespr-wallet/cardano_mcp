import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { lovelaceToAda, formatTokenAmount } from "../utils/cardano.js";
import { formatWithCommas } from "../utils/formatting.js";
import { isValidCardanoAddress } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { FiatCurrency, SUPPORTED_CURRENCIES } from "../types/currency.js";

const tokenOutputSchema = z.object({
  name: z.string().describe("The name of the token"),
  ticker: z.string().nullish().describe("The ticker of the token"),
  amount: z.string().describe("The amount of the token"),
  value: z.string().nullish().describe("The value of the token in the specified currency"),
});

const balanceOutputSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES).describe("The currency used for the portfolio and token value"),
  portfolio_value: z.string().describe("The total value (ada + tokens) of the wallet in the specified currency"),
  ada_balance: z.string().describe("The balance of ADA in the wallet"),
  staking_rewards: z.string().describe("The balance of staking rewards in the wallet"),
  tokens: z.array(tokenOutputSchema).describe("The tokens associated with the wallet"),
  handles: z.array(z.string()).describe("The ADA handles associated with the wallet"),
});

type TokenOutput = z.infer<typeof tokenOutputSchema>;
type BalanceOutput = z.infer<typeof balanceOutputSchema>;

export function registerGetWalletBalance(server: McpServer): void {
  server.registerTool(
    "get_wallet_balance",
    {
      title: "Get Wallet Balance",
      description:
        "Query Cardano wallet balance including ADA and native tokens. This will include the balance from all addresses associated with this wallet, not just the address provided.",
      inputSchema: {
        address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
        currency: z
          .enum(SUPPORTED_CURRENCIES)
          .describe("The currency to use for the displayed data")
          .default(FiatCurrency.USD),
      },
      outputSchema: balanceOutputSchema,
    },
    async ({ address, currency }) => {
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

      if (!SUPPORTED_CURRENCIES.includes(currency)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Invalid currency. Currency must be one of the supported fiat currencies.",
            },
          ],
          isError: true,
        };
      }

      try {
        const [walletData, spotPrice] = await Promise.all([
          VesprApiRepository.getDetailedWallet(address),
          VesprApiRepository.getAdaSpotPrice(currency),
        ]);

        const fiatSpotPrice = parseFloat(spotPrice.spot);

        // Transform response to match our output schema
        const adaBalance = lovelaceToAda(walletData.lovelace);
        const stakingRewards = lovelaceToAda(walletData.rewards_lovelace);

        const tokens: TokenOutput[] = walletData.tokens.map((token) => {
          const decimalsAdjustedAmount = formatTokenAmount(token.quantity, token.decimals);
          const adaPerAdjustedUnit = token.ada_per_adjusted_unit ? parseFloat(token.ada_per_adjusted_unit) : null;
          const adaWorth = adaPerAdjustedUnit ? parseFloat(decimalsAdjustedAmount) * adaPerAdjustedUnit : null;
          const currencyWorth = adaWorth ? adaWorth * fiatSpotPrice : null;
          const tokenOutput: TokenOutput = {
            name: token.name || token.hex_asset_name,
            ticker: token.ticker,
            amount: decimalsAdjustedAmount,
            value: currencyWorth ? currencyWorth.toFixed(2) : null,
          };

          return tokenOutput;
        });

        const adaBalanceValue = parseFloat(adaBalance) * fiatSpotPrice;

        const portfolioValue = tokens.reduce(
          (acc, token) => acc + (token.value ? parseFloat(token.value) : 0),
          adaBalanceValue,
        );

        const output: BalanceOutput = {
          currency,
          portfolio_value: portfolioValue.toFixed(2),
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
          `Portfolio Value (ADA + Tokens): ${portfolioValue.toFixed(2)} ${currency}`,
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

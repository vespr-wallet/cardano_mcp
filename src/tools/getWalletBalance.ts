import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchWalletDetailed, VesprApiError } from '../api/client.js';
import { isValidCardanoAddress } from '../utils/validation.js';

/**
 * Format a number string with commas for readability
 * e.g., "1234567.890000" -> "1,234,567.890000"
 */
function formatWithCommas(value: string): string {
  const [whole, decimal] = value.split('.');
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${formattedWhole}.${decimal}` : formattedWhole;
}

/**
 * Convert lovelace (bigint string) to ADA string with 6 decimal places
 * 1 ADA = 1,000,000 lovelace
 */
function lovelaceToAda(lovelace: string): string {
  const value = BigInt(lovelace);
  const ada = value / BigInt(1_000_000);
  const remainder = value % BigInt(1_000_000);
  const decimals = remainder.toString().padStart(6, '0');
  return `${ada}.${decimals}`;
}

/**
 * Format token amount based on decimals
 */
function formatTokenAmount(quantity: string, decimals: number): string {
  if (decimals === 0) {
    return quantity;
  }
  const value = BigInt(quantity);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  const decimalPart = remainder.toString().padStart(decimals, '0');
  return `${whole}.${decimalPart}`;
}

export function registerGetWalletBalance(server: McpServer): void {
  server.registerTool(
    'get_wallet_balance',
    {
      title: 'Get Wallet Balance',
      description: 'Query Cardano wallet balance including ADA and native tokens',
      inputSchema: {
        address: z.string().describe('Cardano wallet address (bech32 format, addr1...)'),
      },
      outputSchema: {
        ada_balance: z.string(),
        staking_rewards: z.string(),
        tokens: z.array(z.object({
          name: z.string(),
          ticker: z.string().nullable(),
          amount: z.string(),
        })),
        handles: z.array(z.string()),
      },
    },
    async ({ address }) => {
      // Validate address format before making API call
      if (!isValidCardanoAddress(address)) {
        return {
          content: [{
            type: 'text' as const,
            text: "Error: Invalid Cardano address. Address should start with 'addr1' (mainnet) or 'addr_test1' (testnet).",
          }],
          isError: true,
        };
      }

      try {
        const walletData = await fetchWalletDetailed(address);

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
          `Tokens: ${tokenCount} token${tokenCount !== 1 ? 's' : ''}`,
          `Handles: ${handleCount > 0 ? walletData.handles.join(', ') : 'none'}`,
        ].join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: textSummary + '\n\n' + JSON.stringify(output, null, 2),
          }],
          structuredContent: output,
        };
      } catch (error) {
        // Handle VesprApiError with user-friendly message
        if (error instanceof VesprApiError) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: ${error.message}`,
            }],
            isError: true,
          };
        }

        // Handle unexpected errors
        return {
          content: [{
            type: 'text' as const,
            text: `Error: An unexpected error occurred. ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }
    }
  );
}

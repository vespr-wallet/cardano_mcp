import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { lovelaceToAda } from "../utils/cardano.js";
import { isValidPoolId } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import type { PoolInfoResponse, PoolState } from "../types/api/schemas.js";

// Output schema for pool info
const poolInfoOutputSchema = z.object({
  pool_id: z.string(),
  name: z.string().nullable(),
  ticker: z.string().nullable(),
  description: z.string().nullable(),
  homepage: z.string().nullable(),
  state: z.enum(["registered", "retiring", "retired"]),
  apy: z.number(),
  saturation: z.number(),
  delegators_count: z.number(),
  active_stake_ada: z.string(),
  live_stake_ada: z.string(),
  pledge_ada: z.string(),
  fixed_fee_ada: z.string(),
  variable_fee: z.number(),
  total_blocks: z.number(),
});

/**
 * Format state for display
 */
function formatState(state: PoolState): string {
  switch (state) {
    case "registered":
      return "Registered (Active)";
    case "retiring":
      return "Retiring";
    case "retired":
      return "Retired";
    default:
      return state;
  }
}

/**
 * Format human-readable text for pool info
 */
function formatHumanReadable(response: PoolInfoResponse): string {
  const lines: string[] = [];

  // Pool name and ticker
  const name = response.detail?.name ?? "Unknown Pool";
  const ticker = response.detail?.ticker ?? response.pool_id_bech32.slice(0, 10);
  lines.push(`Pool: ${name} (${ticker})`);
  lines.push(`Pool ID: ${response.pool_id_bech32}`);
  lines.push("");

  // State
  lines.push(`State: ${formatState(response.state)}`);

  // Performance metrics
  lines.push(`APY: ${(response.apy * 100).toFixed(2)}%`);
  lines.push(`Saturation: ${(response.saturation * 100).toFixed(2)}%`);
  lines.push(`Delegators: ${response.delegators_count.toLocaleString()}`);
  lines.push("");

  // Stake info
  const activeStakeAda = lovelaceToAda(response.active_stake_lovelace);
  const liveStakeAda = lovelaceToAda(response.live_stake_lovelace);
  lines.push(`Active Stake: ${Number(activeStakeAda).toLocaleString()} ADA`);
  lines.push(`Live Stake: ${Number(liveStakeAda).toLocaleString()} ADA`);
  lines.push("");

  // Pool parameters
  const pledgeAda = lovelaceToAda(response.pledge);
  const fixedFeeAda = lovelaceToAda(response.fixed_fee);
  lines.push(`Pledge: ${Number(pledgeAda).toLocaleString()} ADA`);
  lines.push(`Fees: ${Number(fixedFeeAda).toLocaleString()} ADA + ${(response.variable_fee * 100).toFixed(2)}%`);
  lines.push("");

  // Block production
  lines.push(`Total Blocks: ${response.total_blocks.toLocaleString()}`);

  // Description if available
  if (response.detail?.description) {
    lines.push("");
    lines.push(`Description: ${response.detail.description}`);
  }

  // Homepage if available
  if (response.detail?.homepage) {
    lines.push(`Homepage: ${response.detail.homepage}`);
  }

  return lines.join("\n");
}

/**
 * Transform API response to output format
 */
function transformResponse(response: PoolInfoResponse): z.infer<typeof poolInfoOutputSchema> {
  return {
    pool_id: response.pool_id_bech32,
    name: response.detail?.name ?? null,
    ticker: response.detail?.ticker ?? null,
    description: response.detail?.description ?? null,
    homepage: response.detail?.homepage ?? null,
    state: response.state,
    apy: response.apy,
    saturation: response.saturation,
    delegators_count: response.delegators_count,
    active_stake_ada: lovelaceToAda(response.active_stake_lovelace),
    live_stake_ada: lovelaceToAda(response.live_stake_lovelace),
    pledge_ada: lovelaceToAda(response.pledge),
    fixed_fee_ada: lovelaceToAda(response.fixed_fee),
    variable_fee: response.variable_fee,
    total_blocks: response.total_blocks,
  };
}

export function registerGetPoolInfo(server: McpServer): void {
  server.registerTool(
    "get_pool_info",
    {
      title: "Get Pool Info",
      description:
        "Query information about a Cardano stake pool. Returns pool metadata, performance metrics (APY, saturation), stake amounts, fees, and block production statistics.",
      inputSchema: {
        pool_id: z.string().describe("Cardano stake pool ID (bech32 format, pool1...)"),
      },
      outputSchema: poolInfoOutputSchema,
    },
    async ({ pool_id }) => {
      // Validate pool ID
      if (!isValidPoolId(pool_id)) {
        return {
          content: [
            { type: "text" as const, text: "Error: Invalid pool ID. Pool IDs must start with 'pool1' prefix." },
          ],
          isError: true,
        };
      }

      try {
        const response = await VesprApiRepository.getPoolInfo(pool_id.trim());

        const output = transformResponse(response);
        const summary = formatHumanReadable(response);

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof VesprApiError) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` },
          ],
          isError: true,
        };
      }
    },
  );
}
